import { useState, useEffect, useRef } from 'react';
import { 
  Scale, 
  Shield, 
  Zap, 
  Award, 
  Volume2, 
  VolumeX, 
  AlertTriangle 
} from 'lucide-react';

interface Fallacy {
  type: string;
  sentence: string;
}

interface DebateTurn {
  role: 'prosecutor' | 'defender';
  content: string;
  round: number;
  score?: number;
  fallacies?: Fallacy[];
}

const formatVerdictText = (text: string) => {
  if (!text) return null;
  
  // Split by double newlines to get paragraphs
  const paragraphs = text.split("\n\n");
  
  return paragraphs.map((p, i) => {
    let cleanText = p.trim();
    if (!cleanText) return null;
    
    // Detect subheaders (e.g. **ARTICLE I: FINDINGS OF FACT**)
    const headerMatch = cleanText.match(/^\*\*(.*?)\*\*$/);
    if (headerMatch) {
      return (
        <h4 key={i} className="text-xs font-mono font-bold tracking-widest text-cyber-judge uppercase border-b border-cyber-judge/20 pb-1.5 mt-5 mb-3">
          {headerMatch[1]}
        </h4>
      );
    }
    
    // Handle inline bolding (e.g. **text**)
    const parts = cleanText.split(/(\*\*.*?\*\*)/);
    const content = parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={idx} className="text-cyber-judge font-extrabold font-mono">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
    
    // Determine styling for specific declarations (e.g. "IT IS SO ORDERED", "PROSECUTOR WON", etc.)
    const isDecree = cleanText.includes("IT IS SO ORDERED") || cleanText.includes("WON THIS DEBATE") || cleanText.includes("WINNER") || cleanText.includes("FAILED TO PREVAIL");
    
    return (
      <p key={i} className={`text-xs md:text-sm leading-relaxed font-mono mb-3 ${isDecree ? 'text-cyber-judge bg-[#0b1b15]/90 border border-cyber-judge/30 rounded-lg p-4 text-center font-bold tracking-wide shadow-md mt-4 glow-text-green' : 'text-slate-300'}`}>
        {content}
      </p>
    );
  });
};

export default function App() {
  // Configurations
  const [topic, setTopic] = useState("");
  const [maxRounds, setMaxRounds] = useState(2);
  const [connectionMode, setConnectionMode] = useState<'simulated' | 'live'>('live');
  const [isBackendOffline, setIsBackendOffline] = useState(false);
  
  // Debate States
  const [isTrialRunning, setIsTrialRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [turns, setTurns] = useState<DebateTurn[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<'prosecutor' | 'defender' | 'judge' | 'marshall' | 'none'>('none');
  const [marshallLog, setMarshallLog] = useState("Awaiting courtroom convene directive...");
  const [finalVerdict, setFinalVerdict] = useState("");
  
  // Word-by-Word Typing States
  const [typingText, setTypingText] = useState("");
  const [typingRole, setTypingRole] = useState<'prosecutor' | 'defender' | 'none'>('none');
  
  // UI Controls
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const typingIntervalRef = useRef<any>(null);
  const liveEventQueueRef = useRef<any[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play audio beep for micro-interactions
  const playBeep = (type: 'click' | 'alert' | 'complete' | 'system') => {
    if (!soundEnabled || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      if (ctx.state === 'closed') return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'click') {
        osc.frequency.setValueAtTime(900, ctx.currentTime);
        gain.gain.setValueAtTime(0.02, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.03);
      } else if (type === 'alert') {
        osc.frequency.setValueAtTime(1100, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'system') {
        osc.frequency.setValueAtTime(350, ctx.currentTime);
        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'complete') {
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {
      console.warn("Audio context failed", e);
    }
  };

  // Pre-fetch speech voices
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const loadVoices = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, []);

  // Check backend health status dynamically to detect offline judge
  useEffect(() => {
    const checkBackend = () => {
      fetch("https://cyber-court-backend.onrender.com/")
        .then(res => res.json())
        .then(data => {
          if (data.status === "online") {
            setIsBackendOffline(false);
            setMarshallLog(prev => prev === "The Judge is currently on leave. Court cannot convene." ? "Awaiting courtroom convene directive..." : prev);
          } else {
            setIsBackendOffline(true);
            setMarshallLog("The Judge is currently on leave. Court cannot convene.");
          }
        })
        .catch(() => {
          setIsBackendOffline(true);
          setMarshallLog("The Judge is currently on leave. Court cannot convene.");
        });
    };
    
    checkBackend();
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  // Spatial audio text-to-speech voice routing with callback triggers
  const speakText = (text: string, role: 'prosecutor' | 'defender' | 'judge', onEnd?: () => void) => {
    if (!soundEnabled) {
      if (onEnd) onEnd();
      return;
    }
    try {
      window.speechSynthesis.cancel(); // Abort active speaking
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      
      const englishVoices = voices.filter(v => v.lang.startsWith('en'));
      const activeVoices = englishVoices.length > 0 ? englishVoices : voices;
      
      if (role === 'prosecutor') {
        // Young voice: female or energetic register
        const youngVoice = activeVoices.find(v => 
          v.name.toLowerCase().includes("zira") || 
          v.name.toLowerCase().includes("hazel") || 
          v.name.toLowerCase().includes("female") || 
          v.name.toLowerCase().includes("google uk english female")
        ) || activeVoices[0];
        if (youngVoice) utterance.voice = youngVoice;
        utterance.pitch = 1.35; // Energetic, young pitch
        utterance.rate = 1.05;  // Slightly faster speech
      } 
      else if (role === 'defender') {
        // Mature man voice: David, standard male register
        const maleVoices = activeVoices.filter(v => 
          v.name.toLowerCase().includes("david") || 
          v.name.toLowerCase().includes("male") || 
          v.name.toLowerCase().includes("desktop")
        );
        const defenderVoice = maleVoices[0] || activeVoices[1] || activeVoices[0];
        if (defenderVoice) utterance.voice = defenderVoice;
        
        // Pitch differences ensures clear difference even if falling back to same voice!
        utterance.pitch = 1.02; // Normal mature pitch
        utterance.rate = 0.95;  // Standard pace
      } 
      else if (role === 'judge') {
        // Old man voice: deep, gravelly register (George, Mark, Ravi)
        const maleVoices = activeVoices.filter(v => 
          v.name.toLowerCase().includes("george") || 
          v.name.toLowerCase().includes("mark") || 
          v.name.toLowerCase().includes("male") ||
          v.name.toLowerCase().includes("ravi")
        );
        const judgeVoice = maleVoices[1] || maleVoices[0] || activeVoices[2] || activeVoices[0];
        if (judgeVoice) utterance.voice = judgeVoice;
        
        // Deep pitch modification ensures he sounds like an elderly magistrate
        utterance.pitch = 0.52; // Very deep old pitch
        utterance.rate = 0.76;  // Slow, measured tempo
      }

      utterance.onend = () => {
        if (onEnd) onEnd();
      };
      utterance.onerror = () => {
        if (onEnd) onEnd();
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("SpeechSynthesis error:", e);
      if (onEnd) onEnd();
    }
  };

  // Typing effect helper - triggers voice speech and waits for completion
  const startWordByWordTyping = (
    role: 'prosecutor' | 'defender', 
    fullText: string, 
    onComplete: () => void,
    onSpeechEnd?: () => void
  ) => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }
    
    // Trigger speech synthesis voice
    speakText(fullText, role, onSpeechEnd);
    
    setTypingRole(role);
    setTypingText("");
    
    const words = fullText.split(" ");
    let currentWordIndex = 0;
    let accumulatedText = "";
    
    typingIntervalRef.current = setInterval(() => {
      if (currentWordIndex < words.length) {
        accumulatedText += (currentWordIndex === 0 ? "" : " ") + words[currentWordIndex];
        setTypingText(accumulatedText);
        currentWordIndex++;
        
        // Play typing click sound
        if (soundEnabled && currentWordIndex % 2 === 0) {
          playBeep('click');
        }
      } else {
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
        }
        setTypingRole('none');
        onComplete();
      }
    }, 45);
  };

  // Queue-based Live WebSocket execution
  const processNextLiveEvent = () => {
    if (liveEventQueueRef.current.length === 0) {
      isProcessingQueueRef.current = false;
      return;
    }
    
    isProcessingQueueRef.current = true;
    const data = liveEventQueueRef.current.shift();
    
    switch (data.event) {
      case 'court_initialized':
        setSessionId(data.session_id);
        setMarshallLog(`Court convened successfully. Session ID: ${data.session_id}`);
        setCurrentSpeaker('none'); // Keep marshall silent
        playBeep('alert');
        processNextLiveEvent();
        break;
        
      case 'node_transition':
        const { active_node, data: nodeData, scoreboard } = data;
        
        if (active_node === 'prosecutor') {
          setCurrentSpeaker('prosecutor');
          setMarshallLog("Prosecution presenting logic briefs...");
          
          setTurns(prev => [...prev, {
            role: 'prosecutor',
            content: nodeData.text || "",
            round: scoreboard.current_round
          }]);

          startWordByWordTyping('prosecutor', nodeData.text || "", 
            () => {
              setCurrentSpeaker('judge');
            },
            () => {
              processNextLiveEvent();
            }
          );
        } 
        else if (active_node === 'defender') {
          setCurrentSpeaker('defender');
          setMarshallLog("Defense presenting counter briefs...");
          
          setTurns(prev => [...prev, {
            role: 'defender',
            content: nodeData.text || "",
            round: scoreboard.current_round
          }]);

          startWordByWordTyping('defender', nodeData.text || "", 
            () => {
              setCurrentSpeaker('judge');
            },
            () => {
              processNextLiveEvent();
            }
          );
        }
        else if (active_node === 'judge') {
          setCurrentSpeaker('judge');
          setMarshallLog("Judge evaluating arguments and scores...");
          playBeep('alert');
          
          const evaluation = nodeData.evaluation;
          if (evaluation) {
            setTurns(prev => {
              if (prev.length === 0) return prev;
              const updated = [...prev];
              updated[updated.length - 1].score = evaluation.score;
              updated[updated.length - 1].fallacies = evaluation.fallacies;
              return updated;
            });
          }
          
          // Proceed to next queued event immediately
          processNextLiveEvent();
        }
        else if (active_node === 'verdict') {
          setCurrentSpeaker('judge');
          setMarshallLog("Judge delivering final courtroom verdict...");
          setFinalVerdict(scoreboard.verdict || "");
          playBeep('complete');
          
          speakText(scoreboard.verdict || "", 'judge', () => {
            processNextLiveEvent();
          });
        }
        break;
        
      case 'court_adjourned':
        setMarshallLog("Court adjourned. Session data synchronized.");
        playBeep('complete');
        if (data.final_verdict) {
          setFinalVerdict(data.final_verdict);
          speakText(data.final_verdict, 'judge', () => {
            setIsTrialRunning(false);
            setCurrentSpeaker('none');
            isProcessingQueueRef.current = false;
          });
        } else {
          setIsTrialRunning(false);
          setCurrentSpeaker('none');
          isProcessingQueueRef.current = false;
        }
        break;
        
      case 'court_error':
        setMarshallLog(`Protocol Aborted: ${data.details}`);
        setIsTrialRunning(false);
        setCurrentSpeaker('none');
        speakText("Court error. Trial protocol aborted.", 'judge', () => {
          isProcessingQueueRef.current = false;
        });
        playBeep('alert');
        break;
        
      default:
        processNextLiveEvent();
        break;
    }
  };

  const runLiveDebate = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }

    setTurns([]);
    setFinalVerdict("");
    setTypingRole('none');
    setTypingText("");
    liveEventQueueRef.current = [];
    isProcessingQueueRef.current = false;
    
    setIsTrialRunning(true);
    setCurrentSpeaker('none'); // Silent Marshall
    setMarshallLog("Establishing connection with courtroom backend...");
    playBeep('system');
    
    const socket = new WebSocket("wss://cyber-court-backend.onrender.com/ws/debate");
    wsRef.current = socket;
    
    socket.onopen = () => {
      setMarshallLog("Convene request accepted. Syncing trial environment...");
      socket.send(JSON.stringify({
        topic: topic,
        max_rounds: maxRounds
      }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      liveEventQueueRef.current.push(data);
      
      if (!isProcessingQueueRef.current) {
        processNextLiveEvent();
      }
    };

    socket.onerror = () => {
      setMarshallLog("The Judge is currently on leave. Court cannot convene.");
      setIsBackendOffline(true);
      setIsTrialRunning(false);
      setCurrentSpeaker('none');
      playBeep('alert');
    };
  };

  // Simulated local debate walk-through with callback chaining
  const runSimulatedDebate = () => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }
    setTurns([]);
    setFinalVerdict("");
    setTypingRole('none');
    setTypingText("");
    setIsTrialRunning(true);
    setSessionId(`sim_${Math.random().toString(36).substring(2, 8)}`);
    setMarshallLog("Convening simulated evaluation court...");
    playBeep('system');

    // Chained steps to ensure strict speaking/typing sequence
    const steps = [
      // 1. Prosecutor speaks
      (next: () => void) => {
        setCurrentSpeaker('prosecutor');
        setMarshallLog("Prosecution presenting logic briefs...");
        const text = "Human judges are flawed by subjective bias, cognitive fatigue, and inconsistent sentencing. An AI judge operates on pure mathematical logic, executing legal precedent instantly, uniformly, and impartially.";
        setTurns(prev => [...prev, {
          role: 'prosecutor',
          content: text,
          round: 1
        }]);
        startWordByWordTyping('prosecutor', text, 
          () => {},
          () => {
            next();
          }
        );
      },
      // 2. Judge evaluates Prosecutor
      (next: () => void) => {
        setCurrentSpeaker('judge');
        setMarshallLog("Judge evaluating arguments and scores...");
        
        setTurns(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[updated.length - 1].score = 88;
          updated[updated.length - 1].fallacies = [{ type: "Hasty Generalization", sentence: "Human judges are flawed" }];
          return updated;
        });
        
        playBeep('alert');
        setTimeout(next, 1500);
      },
      // 3. Defender speaks
      (next: () => void) => {
        setCurrentSpeaker('defender');
        setMarshallLog("Defense presenting counter briefs...");
        const text = "The Prosecutor offers a dangerous technocratic fantasy. Law is not the automatic execution of code; it requires moral reasoning, empathy, and mercy. An AI model lacks consciousness and cannot comprehend human dignity.";
        setTurns(prev => [...prev, {
          role: 'defender',
          content: text,
          round: 1
        }]);
        startWordByWordTyping('defender', text, 
          () => {},
          () => {
            next();
          }
        );
      },
      // 4. Judge evaluates Defender
      (next: () => void) => {
        setCurrentSpeaker('judge');
        setMarshallLog("Judge evaluating arguments and scores...");
        
        setTurns(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[updated.length - 1].score = 84;
          updated[updated.length - 1].fallacies = [{ type: "Strawman", sentence: "The Prosecutor offers a dangerous technocratic fantasy" }];
          return updated;
        });
        
        playBeep('alert');
        setTimeout(next, 1500);
      },
      // 5. Prosecutor speaks Round 2
      (next: () => void) => {
        setCurrentSpeaker('prosecutor');
        setMarshallLog("Prosecution presenting Round 2 argument...");
        const text = "We must not confuse mercy with arbitrariness. In our current courts, two individuals receive wildly disparate sentences based on a judge's mood. Impartial algorithms guarantee equal protection under the law.";
        setTurns(prev => [...prev, {
          role: 'prosecutor',
          content: text,
          round: 2
        }]);
        startWordByWordTyping('prosecutor', text, 
          () => {},
          () => {
            next();
          }
        );
      },
      // 6. Judge evaluates Prosecutor Round 2
      (next: () => void) => {
        setCurrentSpeaker('judge');
        setMarshallLog("Judge evaluating arguments and scores...");
        
        setTurns(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[updated.length - 1].score = 91;
          updated[updated.length - 1].fallacies = [];
          return updated;
        });
        
        playBeep('alert');
        setTimeout(next, 1500);
      },
      // 7. Defender speaks Round 2
      (next: () => void) => {
        setCurrentSpeaker('defender');
        setMarshallLog("Defense presenting final counter arguments...");
        const text = "Impartiality is an illusion when models are trained on biased historical human decisions. An AI judge simply codifies and masks human prejudice. Surrendering legal judgment to machines removes accountability.";
        setTurns(prev => [...prev, {
          role: 'defender',
          content: text,
          round: 2
        }]);
        startWordByWordTyping('defender', text, 
          () => {},
          () => {
            next();
          }
        );
      },
      // 8. Judge evaluates Defender Round 2
      (next: () => void) => {
        setCurrentSpeaker('judge');
        setMarshallLog("Judge compiling final metrics...");
        
        setTurns(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[updated.length - 1].score = 89;
          updated[updated.length - 1].fallacies = [{ type: "Slippery Slope", sentence: "Surrendering legal judgment" }];
          return updated;
        });
        
        playBeep('alert');
        setTimeout(next, 1500);
      },
      // 9. Final Verdict
      (next: () => void) => {
        setCurrentSpeaker('judge');
        setMarshallLog("Judge delivering final courtroom verdict...");
        const verdict = "UPON FULL REVIEW OF TRIAL RECORD: The Court finds in favor of the DEFENSE. AI shall be restricted to advisory roles, preserving human accountability.";
        setFinalVerdict(verdict);
        
        speakText(verdict, 'judge', () => {
          next();
        });
      }
    ];

    let currentStepIndex = 0;
    const runNext = () => {
      if (currentStepIndex < steps.length) {
        const step = steps[currentStepIndex];
        currentStepIndex++;
        // Tiny visual break between speakers
        setTimeout(() => {
          step(runNext);
        }, 800);
      } else {
        setIsTrialRunning(false);
        setCurrentSpeaker('none');
        setMarshallLog("Court adjourned. Simulated trial report compiled.");
        playBeep('complete');
      }
    };

    // Begin chain
    runNext();
  };

  const handleStartConvene = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } else if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    } catch (e) {
      console.warn("Failed to initialize AudioContext:", e);
    }

    if (connectionMode === 'live') {
      runLiveDebate();
    } else {
      runSimulatedDebate();
    }
  };

  const handleAbort = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsTrialRunning(false);
    setCurrentSpeaker('none');
    setTypingRole('none');
    setTypingText("");
    setMarshallLog("Court convenement aborted by user.");
    playBeep('alert');
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#07070c] cyber-grid text-slate-200 font-sans p-4 md:p-6 flex flex-col justify-between select-none">
      
      {/* 🏛️ SLEEK SIMPLIFIED HEADER */}
      <header className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 shadow-xl mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-cyber-prosecutor to-cyber-defender p-[1.5px]">
              <div className="w-full h-full bg-slate-950 rounded-lg flex items-center justify-center">
                <Scale className="w-5 h-5 text-cyber-prosecutor" />
              </div>
            </div>
            <div>
              <h1 className="text-sm font-black tracking-widest text-slate-100 font-mono uppercase bg-gradient-to-r from-cyber-prosecutor to-cyber-defender bg-clip-text text-transparent">
                Cyber Court
              </h1>
              <span className="text-[9px] font-mono text-slate-500 block tracking-wider uppercase">
                AI Judicial System
              </span>
            </div>
          </div>
          
          <div className="h-8 w-[1px] bg-slate-800 hidden sm:block" />

          <div className="flex-1 w-full sm:w-64 md:w-80 lg:w-96">
            <label className="text-[9px] font-mono tracking-widest text-slate-500 uppercase block mb-1">
              Active Debate Topic Vector (Click to Edit)
            </label>
            <input 
              type="text" 
              value={topic}
              disabled={isTrialRunning}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter custom debate topic..."
              className="w-full bg-[#0b0b14]/80 border border-slate-800 focus:border-cyber-prosecutor text-slate-100 font-semibold focus:outline-none text-xs md:text-sm rounded px-3 py-1.5 disabled:opacity-50 transition-all font-sans hover:border-slate-700 shadow-inner"
            />
          </div>
        </div>

        {/* Configurations & CTA Button */}
        <div className="flex items-center gap-3">
          <select 
            value={maxRounds}
            disabled={isTrialRunning}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
            className="bg-[#0b0b14] border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-400 focus:outline-none focus:border-cyber-prosecutor"
            title="Max Rounds Configuration"
          >
            <option value={1}>1 Round</option>
            <option value={2}>2 Rounds</option>
            <option value={3}>3 Rounds</option>
            <option value={4}>4 Rounds</option>
          </select>

          <button 
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              playBeep('click');
            }}
            className={`p-1.5 rounded border text-xs font-mono flex items-center justify-center ${soundEnabled ? 'border-cyber-prosecutor text-cyber-prosecutor' : 'border-slate-800 text-slate-500'}`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {isBackendOffline ? (
            <button
              disabled
              className="bg-slate-900 border border-slate-800 text-slate-500 px-5 py-1.5 rounded font-mono font-bold text-xs tracking-wider cursor-not-allowed opacity-50"
              title="Judge is currently on leave. Start the backend server to enable."
            >
              JUDGE ON LEAVE
            </button>
          ) : !isTrialRunning ? (
            <button
              onClick={handleStartConvene}
              className="bg-gradient-to-r from-cyber-prosecutor to-cyber-defender text-slate-950 px-5 py-1.5 rounded font-mono font-bold text-xs tracking-wider active:scale-95 transition-all shadow-[0_0_15px_rgba(0,240,255,0.2)]"
            >
              CONVENE
            </button>
          ) : (
            <button
              onClick={handleAbort}
              className="bg-red-950 border border-red-500 text-red-400 px-5 py-1.5 rounded font-mono font-bold text-xs tracking-wider active:scale-95 transition-all animate-pulse"
            >
              ABORT
            </button>
          )}
        </div>
      </header>

      {/* ⚠️ BACKEND OFFLINE ALERT */}
      {isBackendOffline && (
        <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center gap-3 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.08)]">
          <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse shrink-0" />
          <div className="text-xs md:text-sm">
            <span className="font-bold uppercase tracking-wide">Court Notice:</span> The Presiding Judge is currently on leave. The courtroom server is offline. Please start the backend.
          </div>
        </div>
      )}

      {/* 📢 COURTROOM FLOOR / SIDE-BY-SIDE SPATIAL LAYOUT */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch mb-6">
        
        {/* PROSECUTOR (Left) */}
        <section 
          className={`bg-slate-950/40 border rounded-xl p-6 flex flex-col justify-between transition-all duration-300 relative ${
            currentSpeaker === 'prosecutor' 
              ? 'border-cyber-prosecutor shadow-glow-prosecutor scale-[1.005] bg-cyber-prosecutor/[0.01]' 
              : 'border-slate-800/80 opacity-40'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                currentSpeaker === 'prosecutor' ? 'border-cyber-prosecutor bg-cyber-prosecutor/10 shadow-[0_0_10px_rgba(0,240,255,0.3)]' : 'border-slate-800'
              }`}>
                <Zap className={`w-6 h-6 ${currentSpeaker === 'prosecutor' ? 'text-cyber-prosecutor' : 'text-slate-500'}`} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-cyber-prosecutor">Advocate I</span>
                <h2 className="text-base font-bold text-slate-100 tracking-wide">PROSECUTION (TECH OPTIMIST)</h2>
              </div>
            </div>

            {/* Speeches & Typing container */}
            <div className="space-y-4 min-h-[160px] max-h-[300px] overflow-y-auto pr-1">
              {typingRole === 'prosecutor' ? (
                <div className="bg-slate-950/80 border border-cyber-prosecutor/20 rounded-lg p-4 font-mono text-sm leading-relaxed text-slate-200">
                  {typingText}
                  <span className="inline-block w-1.5 h-4 bg-cyber-prosecutor ml-1 animate-pulse"></span>
                </div>
              ) : turns.filter(t => t.role === 'prosecutor').length === 0 ? (
                <div className="text-xs font-mono text-slate-600 italic py-6">Awaiting argument draft...</div>
              ) : (
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-4 font-mono text-sm leading-relaxed text-slate-300">
                  {turns.filter(t => t.role === 'prosecutor')[turns.filter(t => t.role === 'prosecutor').length - 1].content}
                </div>
              )}
            </div>
          </div>

          {/* Mini scorecard for latest turn */}
          {turns.filter(t => t.role === 'prosecutor').length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Latest Gavel Score:</span>
              <span className="text-cyber-prosecutor font-bold text-sm">
                {turns.filter(t => t.role === 'prosecutor')[turns.filter(t => t.role === 'prosecutor').length - 1].score ?? "N/A"}/100
              </span>
            </div>
          )}
        </section>

        {/* DEFENDER (Right) */}
        <section 
          className={`bg-slate-950/40 border rounded-xl p-6 flex flex-col justify-between transition-all duration-300 relative ${
            currentSpeaker === 'defender' 
              ? 'border-cyber-defender shadow-glow-defender scale-[1.005] bg-cyber-defender/[0.01]' 
              : 'border-slate-800/80 opacity-40'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                currentSpeaker === 'defender' ? 'border-cyber-defender bg-cyber-defender/10 shadow-[0_0_10px_rgba(168,85,247,0.3)]' : 'border-slate-800'
              }`}>
                <Shield className={`w-6 h-6 ${currentSpeaker === 'defender' ? 'text-cyber-defender' : 'text-slate-500'}`} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-cyber-defender">Advocate II</span>
                <h2 className="text-base font-bold text-slate-100 tracking-wide">DEFENSE (CIVIL ADVOCATE)</h2>
              </div>
            </div>

            {/* Speeches & Typing container */}
            <div className="space-y-4 min-h-[160px] max-h-[300px] overflow-y-auto pr-1">
              {typingRole === 'defender' ? (
                <div className="bg-slate-950/80 border border-cyber-defender/20 rounded-lg p-4 font-mono text-sm leading-relaxed text-slate-200">
                  {typingText}
                  <span className="inline-block w-1.5 h-4 bg-cyber-defender ml-1 animate-pulse"></span>
                </div>
              ) : turns.filter(t => t.role === 'defender').length === 0 ? (
                <div className="text-xs font-mono text-slate-600 italic py-6">Awaiting argument draft...</div>
              ) : (
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-4 font-mono text-sm leading-relaxed text-slate-300">
                  {turns.filter(t => t.role === 'defender')[turns.filter(t => t.role === 'defender').length - 1].content}
                </div>
              )}
            </div>
          </div>

          {/* Mini scorecard for latest turn */}
          {turns.filter(t => t.role === 'defender').length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Latest Gavel Score:</span>
              <span className="text-cyber-defender font-bold text-sm">
                {turns.filter(t => t.role === 'defender')[turns.filter(t => t.role === 'defender').length - 1].score ?? "N/A"}/100
              </span>
            </div>
          )}
        </section>

      </main>

      {/* ⚖️ JUDGE BENCH / VERDICT & STATS SECTION */}
      <section className="space-y-4">
        
        {/* Real-time Status Banner */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-marshall animate-ping"></span>
            <span className="text-slate-500 uppercase">MarshallDirective &gt;</span>
            <span className="text-slate-200 truncate font-semibold">{marshallLog}</span>
          </div>
          <span>Status: {currentSpeaker.toUpperCase()} ACTIVE {sessionId && `// REF: ${sessionId.toUpperCase()}`}</span>
        </div>

        {/* Verdict overlay or Round Summaries */}
        {finalVerdict ? (
          <div className="bg-slate-950/80 border border-cyber-judge/30 rounded-xl p-6 shadow-glow-judge relative overflow-hidden">
            {/* Pulsing jade neon scanning bar indicator */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-cyber-judge/40 animate-pulse" />
            
            <div className="flex items-center gap-2 border-b border-cyber-judge/20 pb-3 mb-4">
              <Award className="w-5 h-5 text-cyber-judge animate-pulse" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-cyber-judge font-mono glow-text-green">
                COURT DECISION & FINAL VERDICT
              </h3>
            </div>
            <div className="space-y-3 animate-fade-in">
              {formatVerdictText(finalVerdict)}
            </div>
          </div>
        ) : turns.length > 0 ? (
          /* Sleek simplified table of round scores and fallacies */
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-3">
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">Round Evaluation Index</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {turns.map((turn, i) => (
                <div key={i} className="bg-[#08080f] border border-slate-900 rounded p-3 flex justify-between items-center text-xs font-mono">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${turn.role === 'prosecutor' ? 'bg-cyber-prosecutor' : 'bg-cyber-defender'}`}></span>
                      <span className="uppercase text-slate-300 font-semibold">{turn.role}</span>
                      <span className="text-slate-500">(Round {turn.round})</span>
                    </div>
                    {turn.fallacies && turn.fallacies.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {turn.fallacies.map((f, fIdx) => (
                          <span key={fIdx} className="text-[9px] px-1 py-0.5 rounded bg-red-950/20 border border-red-500/20 text-red-400">
                            {f.type}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[9px] text-emerald-400">No fallacies detected</span>
                    )}
                  </div>

                  {turn.score && (
                    <div className="text-right">
                      <span className="text-slate-500 block text-[9px] uppercase">Score</span>
                      <span className={`font-bold text-sm ${turn.role === 'prosecutor' ? 'text-cyber-prosecutor' : 'text-cyber-defender'}`}>
                        {turn.score}/100
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-6 text-center text-xs font-mono text-slate-500">
            <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-slate-600" />
            Awaiting court convening to trace logic transcripts.
          </div>
        )}
      </section>
      
    </div>
  );
}
