import React from 'react';

export const AnimatedBackground: React.FC = () => {
  // Generate random particles
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    left: Math.random() * 100,
    animationDuration: Math.random() * 20 + 15,
    animationDelay: Math.random() * -20,
    opacity: Math.random() * 0.5 + 0.3,
  }));

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 opacity-30">
          {/* Animated gradient orbs */}
          <div 
            className="absolute top-0 -left-40 w-96 h-96 bg-indigo-600 rounded-full mix-blend-normal filter blur-3xl opacity-20 animate-blob"
            style={{ animationDelay: '0s' }}
          />
          <div 
            className="absolute top-0 -right-40 w-96 h-96 bg-violet-600 rounded-full mix-blend-normal filter blur-3xl opacity-20 animate-blob"
            style={{ animationDelay: '2s' }}
          />
          <div 
            className="absolute -bottom-40 left-1/2 w-96 h-96 bg-purple-600 rounded-full mix-blend-normal filter blur-3xl opacity-20 animate-blob"
            style={{ animationDelay: '4s' }}
          />
        </div>
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 animate-float"
            style={{
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              left: `${particle.left}%`,
              bottom: '-10px',
              opacity: particle.opacity,
              animationDuration: `${particle.animationDuration}s`,
              animationDelay: `${particle.animationDelay}s`,
              boxShadow: `0 0 ${particle.size * 2}px rgba(129, 140, 248, 0.3)`,
            }}
          />
        ))}
      </div>

      {/* Grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(139, 92, 246, 0.3) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(139, 92, 246, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Vignette effect */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-slate-950 opacity-60" />
    </div>
  );
};
