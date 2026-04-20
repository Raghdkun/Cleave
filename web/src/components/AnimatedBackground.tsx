export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* Violet blob */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-600/25 blur-[120px] animate-float-1" />
      {/* Cyan blob */}
      <div className="absolute top-1/3 -right-20 w-[400px] h-[400px] rounded-full bg-cyan-500/20 blur-[120px] animate-float-2" />
      {/* Pink blob */}
      <div className="absolute -bottom-40 left-1/3 w-[450px] h-[450px] rounded-full bg-pink-500/15 blur-[120px] animate-float-3" />
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}
