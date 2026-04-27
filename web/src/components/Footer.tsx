import { Bug, Heart } from 'lucide-react';
import { useFeedback } from './FeedbackProvider';

export function Footer() {
  const { open } = useFeedback();
  return (
    <footer className="relative z-10 mt-auto px-4 py-6 border-t border-white/[0.05] backdrop-blur-sm">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <p className="text-white/30">
          © {new Date().getFullYear()} Cleave. All rights reserved.
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => open({ kind: 'BUG' })}
            className="flex items-center gap-1.5 text-white/50 transition hover:text-white"
          >
            <Bug className="w-3 h-3" />
            Report a bug
          </button>
          <p className="text-white/40 flex items-center gap-1.5">
            Crafted with <Heart className="w-3 h-3 text-pink-400 fill-pink-400" /> by{' '}
            <a
              href="https://raghdkun.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent hover:from-violet-200 hover:to-cyan-200 transition-all"
            >
              Raghdkun
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
