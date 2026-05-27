
import React, { useState, useEffect } from 'react';
import { Cpu, CheckCircle, Zap, Shield, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GRADEMASTER_ENGINE_V1 } from '../lib/ai-engine-registry';

export const AIEngineStatus: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(prev => !prev);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="bg-indigo-600 text-white p-3 rounded-full shadow-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
        id="ai-engine-toggle"
      >
        <div className="relative">
          <Cpu className="w-5 h-5" />
          <motion.div
            animate={{ scale: pulse ? [1, 1.5, 1] : 1, opacity: pulse ? [0.5, 0, 0.5] : 0.5 }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute -inset-1 bg-indigo-300 rounded-full"
          />
        </div>
        <span className="text-sm font-medium pr-1">GradeMaster AI Online</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-16 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-indigo-100 overflow-hidden"
            id="ai-engine-panel"
          >
            <div className="bg-indigo-600 p-4 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{GRADEMASTER_ENGINE_V1.name}</h3>
                  <p className="text-indigo-100 text-xs">Version {GRADEMASTER_ENGINE_V1.version} (Optimized)</p>
                </div>
                <Zap className="text-yellow-300 w-5 h-5 fill-yellow-300" />
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              <p className="text-gray-600 text-sm leading-relaxed italic">
                "{GRADEMASTER_ENGINE_V1.description}"
              </p>
              
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Protocols</p>
                <div className="grid grid-cols-1 gap-2">
                  {GRADEMASTER_ENGINE_V1.capabilities.map((cap, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-700 bg-indigo-50/50 p-2 rounded-lg border border-indigo-50">
                      <CheckCircle className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span>{cap}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-[10px] text-gray-500">
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  <span>Safety: Verified</span>
                </div>
                <div className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  <span>Cloud: Powered by AI Studio</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
