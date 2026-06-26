import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ProductionProfile, ProductionProfileStore } from '../types';
import {
  createProductionProfile,
  duplicateProductionProfile,
  exportProductionProfiles,
  importProductionProfiles,
  isProductionProfileImportFileSizeAllowed,
  productionProfilesHaveSameEditableContent,
  reviseProductionProfile,
  validateProductionProfile,
} from '../services/productionProfiles';
import {
  addProfileToStore,
  archiveProfile,
  proposeImportedProfileStore,
  replaceProfileInStore,
  setDefaultProfile,
} from '../services/profileStorage';
import { ProfileEditor } from './ProfileEditor';
import { useAccessibleDialog } from './useAccessibleDialog';

interface ProfileManagerProps {
  store: ProductionProfileStore;
  onStoreChange: (store: ProductionProfileStore) => boolean;
  onClose: () => void;
  onError?: (message: string) => void;
}

type EditorState = {
  mode: 'create' | 'edit';
  draft: ProductionProfile;
  original: ProductionProfile | null;
};

const STORAGE_ERROR =
  'Profiles could not be saved locally. Export a backup or free browser storage, then retry.';

const downloadProfiles = (profiles: ProductionProfile[], filename: string) => {
  const blob = new Blob([exportProductionProfiles(profiles)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const uniqueNewProfileName = (profiles: ProductionProfile[]) => {
  const names = new Set(profiles.map((profile) => profile.name.toLowerCase()));
  if (!names.has('new profile')) return 'New profile';
  let suffix = 2;
  while (names.has(`new profile ${suffix}`)) suffix += 1;
  return `New profile ${suffix}`;
};

export const ProfileManager: React.FC<ProfileManagerProps> = ({
  store,
  onStoreChange,
  onClose,
  onError,
}) => {
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState('');
  const [managerError, setManagerError] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const archiveCancelRef = useRef<HTMLButtonElement>(null);
  const visibleProfiles = store.profiles.filter(
    (profile) => showArchived || profile.archivedAt === null,
  );
  const activeProfiles = store.profiles.filter((profile) => profile.archivedAt === null);
  const validation = useMemo(
    () => editor ? validateProductionProfile(editor.draft) : { valid: true, errors: [] },
    [editor],
  );
  const editorUnchanged = Boolean(
    editor?.mode === 'edit'
    && editor.original
    && productionProfilesHaveSameEditableContent(editor.original, editor.draft),
  );
  const closeEditor = useCallback(() => {
    setEditor(null);
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, []);
  const closeMainDialog = useCallback(() => {
    if (editor) closeEditor();
    else onClose();
  }, [closeEditor, editor, onClose]);
  const cancelArchiveDialog = useCallback(() => {
    setArchiveTargetId(null);
    setReplacementId('');
  }, []);
  const managerDialogRef = useAccessibleDialog({
    open: true,
    topmost: archiveTargetId === null,
    onClose: closeMainDialog,
    initialFocusRef: closeButtonRef,
  });
  const archiveDialogRef = useAccessibleDialog({
    open: archiveTargetId !== null,
    onClose: cancelArchiveDialog,
    initialFocusRef: archiveCancelRef,
  });

  const reportError = (message: string) => {
    setManagerError(message);
    onError?.(message);
  };

  const commitStore = (next: ProductionProfileStore): boolean => {
    setManagerError(null);
    try {
      const committed = onStoreChange(next);
      if (!committed) {
        reportError(STORAGE_ERROR);
        return false;
      }
      return true;
    } catch (error) {
      console.error(error);
      reportError(STORAGE_ERROR);
      return false;
    }
  };

  const saveEditor = () => {
    if (
      !editor
      || !validation.valid
      || !editor.draft.name.trim()
      || editorUnchanged
    ) return;
    try {
      const next = editor.mode === 'create'
        ? addProfileToStore(store, editor.draft)
        : replaceProfileInStore(
            store,
            reviseProductionProfile(editor.original!, {
              name: editor.draft.name,
              description: editor.draft.description,
              printerName: editor.draft.printerName,
              method: editor.draft.method,
              thresholds: editor.draft.thresholds,
              printableAreas: editor.draft.printableAreas,
              defaults: editor.draft.defaults,
              archivedAt: editor.original!.archivedAt,
            }),
          );
      if (commitStore(next)) closeEditor();
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'The profile could not be saved.');
    }
  };

  const handleDuplicate = (profile: ProductionProfile) => {
    try {
      commitStore(addProfileToStore(store, duplicateProductionProfile(profile)));
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'The profile could not be duplicated.');
    }
  };

  const requestArchive = (profile: ProductionProfile) => {
    setManagerError(null);
    if (profile.id === store.defaultProfileId) {
      const replacement = activeProfiles.find((candidate) => candidate.id !== profile.id);
      if (!replacement) {
        reportError('Create another active profile before archiving the default profile.');
        return;
      }
      setArchiveTargetId(profile.id);
      setReplacementId(replacement.id);
      return;
    }
    try {
      commitStore(archiveProfile(store, profile.id));
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'The profile could not be archived.');
    }
  };

  const confirmDefaultArchive = () => {
    if (!archiveTargetId || !replacementId) return;
    try {
      if (commitStore(archiveProfile(store, archiveTargetId, replacementId))) {
        setArchiveTargetId(null);
        setReplacementId('');
      }
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'The profile could not be archived.');
    }
  };

  const handleSetDefault = (profileId: string) => {
    try {
      commitStore(setDefaultProfile(store, profileId));
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'The default profile could not be changed.');
    }
  };

  const handleImport = async (file: File) => {
    setImportErrors([]);
    setManagerError(null);
    if (!isProductionProfileImportFileSizeAllowed(file.size)) {
      setImportErrors(['profiles: Production profile files must be 5 MB or smaller.']);
      return;
    }
    try {
      const result = importProductionProfiles(
        await file.text(),
        store.profiles,
        (incoming, local) => window.confirm(
          `Import ${incoming.name} revision ${incoming.revision} over local revision ${local.revision}?`,
        ),
      );
      if (result.errors.length > 0) {
        setImportErrors(result.errors.map((error) => `${error.field}: ${error.message}`));
        return;
      }
      const proposal = proposeImportedProfileStore(store, result.profiles);
      if (proposal.status === 'error') {
        setImportErrors([`profiles: ${proposal.message}`]);
        return;
      }
      if (proposal.status === 'replacement-required') {
        const confirmed = window.confirm(
          `The imported revision archives or removes the current default. Set "${proposal.replacement.name}" (r${proposal.replacement.revision}) as the new default?`,
        );
        if (!confirmed) return;
        commitStore(setDefaultProfile(proposal.store, proposal.replacement.id));
        return;
      }
      commitStore(proposal.store);
    } catch (error) {
      setImportErrors([
        error instanceof Error ? error.message : 'The profile file could not be imported.',
      ]);
    }
  };

  return (
    <>
    <div ref={managerDialogRef} tabIndex={-1} inert={archiveTargetId !== null ? true : undefined} aria-hidden={archiveTargetId !== null || undefined} className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-0 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="profile-manager-title">
      <div className="flex h-dvh w-full flex-col overflow-hidden border-slate-700 bg-slate-950 shadow-2xl shadow-black/60 sm:h-auto sm:max-h-[92dvh] sm:max-w-5xl sm:rounded-2xl sm:border">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="profile-manager-title" className="truncate text-lg font-black text-white">
              {editor ? editor.mode === 'create' ? 'Create production profile' : `Edit ${editor.original?.name}` : 'Production profiles'}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {editor ? 'Profile changes remain a draft until they save locally.' : 'Manage printer defaults, printable areas, and production output.'}
            </p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={closeMainDialog} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white">
            {editor ? 'Back' : 'Close'}
          </button>
        </header>

        {(managerError || importErrors.length > 0) && (
          <div className="border-b border-rose-900/50 bg-rose-950/40 px-4 py-3 text-xs text-rose-200 sm:px-6" role="alert">
            {managerError && <p>{managerError}</p>}
            {importErrors.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {importErrors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
              </ul>
            )}
          </div>
        )}

        {editor ? (
          <ProfileEditor
            profile={editor.draft}
            validationErrors={validation.errors}
            onChange={(draft) => setEditor((current) => current ? { ...current, draft } : current)}
            onSave={saveEditor}
            onCancel={closeEditor}
            saveDisabledReason={editorUnchanged ? 'No profile changes to save.' : null}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setEditor({
                  mode: 'create',
                  draft: createProductionProfile(uniqueNewProfileName(store.profiles)),
                  original: null,
                })}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
              >
                Create profile
              </button>
              <button type="button" onClick={() => downloadProfiles(store.profiles, 'inkmaster-production-profiles.json')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500">Export all</button>
              <button type="button" onClick={() => importInputRef.current?.click()} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500">Import JSON</button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImport(file);
                  event.target.value = '';
                }}
              />
              <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-400">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Show archived
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              <div className="space-y-2">
                {visibleProfiles.map((profile) => {
                  const archived = profile.archivedAt !== null;
                  const isDefault = profile.id === store.defaultProfileId;
                  return (
                    <article key={profile.id} className={`rounded-xl border p-4 ${archived ? 'border-slate-800 bg-slate-900/30 opacity-70' : 'border-slate-800 bg-slate-900/60'}`}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-black text-white">{profile.name}</h3>
                            {isDefault && <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-indigo-300">Default</span>}
                            {archived && <span className="rounded bg-slate-700/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-300">Archived</span>}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            r{profile.revision} · {profile.method} · {profile.printerName || 'No printer named'}
                          </p>
                          {profile.description && <p className="mt-2 text-xs text-slate-500">{profile.description}</p>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => downloadProfiles([profile], `${profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'profile'}.json`)} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:border-slate-500">Export</button>
                          {!archived && (
                            <>
                              <button type="button" onClick={() => setEditor({ mode: 'edit', draft: structuredClone(profile), original: structuredClone(profile) })} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:border-slate-500">Edit</button>
                              <button type="button" onClick={() => handleDuplicate(profile)} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:border-slate-500">Duplicate</button>
                              <button type="button" disabled={isDefault} onClick={() => handleSetDefault(profile.id)} className="rounded-md border border-indigo-900/70 px-2.5 py-1.5 text-[11px] font-bold text-indigo-300 hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-35">Set default</button>
                              <button type="button" onClick={() => requestArchive(profile)} className="rounded-md border border-rose-900/60 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 hover:border-rose-600">Archive</button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
      {archiveTargetId && (
        <div ref={archiveDialogRef} tabIndex={-1} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="archive-default-title">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
            <h3 id="archive-default-title" className="text-base font-black text-white">Choose a replacement default</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">The current default cannot be archived until another active profile becomes the default.</p>
            <label className="mt-4 block text-xs font-bold text-slate-300">
              Replacement profile
              <select value={replacementId} onChange={(event) => setReplacementId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
                {activeProfiles.filter((profile) => profile.id !== archiveTargetId).map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name} · r{profile.revision}</option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button ref={archiveCancelRef} type="button" onClick={cancelArchiveDialog} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300">Cancel</button>
              <button type="button" onClick={confirmDefaultArchive} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500">Set replacement and archive</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
