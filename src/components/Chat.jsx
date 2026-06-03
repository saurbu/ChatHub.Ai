import { useState, useEffect, useRef } from "react";

function Chat() {
  const [input, setInput] = useState("");
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [copiedId, setCopiedId] = useState("");

  const [theme, setTheme] = useState("dark");
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const recognitionRef = useRef(null);
  const themeMenuRef = useRef(null);

  // Close theme dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target)) {
        setThemeDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync initial mount states safely
  useEffect(() => {
    const savedChats = localStorage.getItem("chathub-sessions");
    const savedTheme = localStorage.getItem("chathub-theme");
    
    if (savedTheme) setTheme(savedTheme);

    if (savedChats) {
      try {
        const parsedChats = JSON.parse(savedChats);
        if (Array.isArray(parsedChats) && parsedChats.length > 0) {
          setChats(parsedChats);
          setCurrentChatId(parsedChats[parsedChats.length - 1].id);
          return;
        }
      } catch (e) {
        console.error("Error parsing local history:", e);
      }
    }
    createNewChatSession();
  }, []);

  // Removed the auto-scroll code from this state hook 
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem("chathub-sessions", JSON.stringify(chats));
    }
  }, [chats]);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem("chathub-theme", newTheme);
    setThemeDropdownOpen(false);
  };

  const createNewChatSession = () => {
    const newId = Date.now().toString();
    const newChat = {
      id: newId,
      title: "New Chat",
      messages: []
    };
    setChats((prev) => [...prev, newChat]);
    setCurrentChatId(newId);
  };

  const currentChat = chats.find(c => c.id === currentChatId) || { messages: [] };
  const messages = currentChat.messages || [];

  const confirmDeleteChat = (id, e) => {
    e.stopPropagation();
    setDeleteTargetId(id);
  };

  const executeDeleteChat = () => {
    const updatedChats = chats.filter(chat => chat.id !== deleteTargetId);
    setChats(updatedChats);
    localStorage.setItem("chathub-sessions", JSON.stringify(updatedChats));

    if (currentChatId === deleteTargetId) {
      if (updatedChats.length > 0) {
        setCurrentChatId(updatedChats[updatedChats.length - 1].id);
      } else {
        const newId = Date.now().toString();
        setChats([{ id: newId, title: "New Chat", messages: [] }]);
        setCurrentChatId(newId);
      }
    }
    setDeleteTargetId(null);
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  const toggleVoice = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      recognition.start();
      setListening(true);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userInput = input;
    const userMessage = { role: "user", content: userInput };

    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === currentChatId) {
          const isFirstMsg = !chat.messages || chat.messages.length === 0;
          return {
            ...chat,
            title: isFirstMsg ? userInput.slice(0, 25) + (userInput.length > 25 ? "..." : "") : chat.title,
            messages: [...(chat.messages || []), userMessage],
          };
        }
        return chat;
      })
    );

    setInput("");
    setLoading(true);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyDIfzcjvznvo5qTe3qyC9jcCtzevgEwY8k`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userInput }] }],
          }),
        }
      );

      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response received";

      setChats((prevChats) =>
        prevChats.map((chat) => {
          if (chat.id === currentChatId) {
            return {
              ...chat,
              messages: [...(chat.messages || []), { role: "assistant", content: aiText }],
            };
          }
          return chat;
        })
      );
    } catch (error) {
      console.error(error);
      setChats((prevChats) =>
        prevChats.map((chat) => {
          if (chat.id === currentChatId) {
            return {
              ...chat,
              messages: [...(chat.messages || []), { role: "assistant", content: "Request Failed" }],
            };
          }
          return chat;
        })
      );
    }
    setLoading(false);
  };

  const handleCopyCode = (text, blockId) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(blockId);
      setTimeout(() => setCopiedId(""), 2000);
    });
  };

  const renderMessageContent = (content, msgIndex) => {
    if (!content) return null;
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const cleanBlock = part.slice(3, -3).trim();
        const firstNewLineIndex = cleanBlock.indexOf("\n");
        const language = firstNewLineIndex !== -1 ? cleanBlock.substring(0, firstNewLineIndex).trim() : "code";
        const codeText = firstNewLineIndex !== -1 ? cleanBlock.substring(firstNewLineIndex + 1) : cleanBlock;
        
        const blockId = `${msgIndex}-${index}`;

        return (
          <div key={blockId} className={`my-4 overflow-hidden rounded-xl border shadow-xl ${theme === 'dark' ? 'border-neutral-800 bg-[#0f0f0f]' : 'border-slate-700/50 bg-black/30'}`}>
            <div className={`flex items-center justify-between px-4 py-1.5 text-xs font-mono select-none border-b ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800 text-neutral-400' : 'bg-black/40 border-slate-700/30'}`}>
              <span className="uppercase text-neutral-400 tracking-wider font-semibold">{language || "text"}</span>
              <button
                onClick={() => handleCopyCode(codeText, blockId)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${theme === 'dark' ? 'bg-[#1a1a1a] text-neutral-200 hover:bg-[#262626]' : 'bg-slate-800/80 hover:bg-slate-700 text-white'}`}
              >
                {copiedId === blockId ? "✓ Copied!" : "📋 Copy"}
              </button>
            </div>
            <div className="p-4 overflow-x-auto text-sm font-mono leading-relaxed">
              <pre className="whitespace-pre">{codeText}</pre>
            </div>
          </div>
        );
      }

      return (
        <p key={index} className="whitespace-pre-wrap break-words inline-block w-full">
          {part}
        </p>
      );
    });
  };

  const themeClasses = {
    dark: {
      bg: "bg-[#0b0b0b] text-[#f5f5f5]",
      sidebar: "bg-[#121212] border-neutral-800/60",
      header: "bg-[#0b0b0b] border-neutral-800/60",
      btnPrimary: "bg-[#f5f5f5] hover:bg-[#e5e5e5] text-[#0b0b0b]",
      chatRoomActive: "bg-[#1e1e1e] border-neutral-700 text-[#ffffff]",
      chatRoomInactive: "bg-[#161616]/40 hover:bg-[#1c1c1c] text-neutral-400",
      userMsg: "bg-[#262626] text-[#ffffff] border border-neutral-800",
      aiMsg: "bg-transparent text-[#e5e5e5]",
      inputBg: "bg-[#121212] border-neutral-800 text-white focus:border-neutral-600"
    },
    light: {
      bg: "bg-gray-50 text-gray-900",
      sidebar: "bg-white border-gray-200",
      header: "bg-white border-gray-200",
      btnPrimary: "bg-blue-600 hover:bg-blue-700 text-white",
      chatRoomActive: "bg-blue-50 border-blue-200 text-blue-600",
      chatRoomInactive: "bg-gray-100 hover:bg-gray-200 text-gray-700",
      userMsg: "bg-blue-600 text-white",
      aiMsg: "bg-white border border-gray-200 text-gray-800 shadow-sm",
      inputBg: "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
    },
    nightRead: {
      bg: "bg-[#2b2621] text-[#f4ecd8]",
      sidebar: "bg-[#211d19] border-[#3a332d]",
      header: "bg-[#211d19] border-[#3a332d]",
      btnPrimary: "bg-[#c98642] hover:bg-[#b07335] text-white",
      chatRoomActive: "bg-[#c98642]/20 border-[#c98642]/40 text-[#ebaf6c]",
      chatRoomInactive: "bg-[#2d2722] hover:bg-[#38302a] text-[#d1c2a5]",
      userMsg: "bg-[#c98642] text-white",
      aiMsg: "bg-[#38302a] text-[#eedcb5] border border-[#4d433a]",
      inputBg: "bg-[#38302a] border-[#4d433a] text-[#f4ecd8] focus:border-[#c98642]"
    },
    cyberpunk: {
      bg: "bg-[#0c0517] text-[#00ffcc]",
      sidebar: "bg-[#140b24] border-[#ff0055]/30",
      header: "bg-[#0c0517] border-[#ff0055]/30",
      btnPrimary: "bg-[#ff0055] hover:bg-[#d60048] text-white shadow-[0_0_10px_#ff0055]",
      chatRoomActive: "bg-[#ff0055]/20 border-[#ff0055] text-[#ff0055] shadow-[0_0_5px_rgba(255,0,85,0.4)]",
      chatRoomInactive: "bg-[#22123b] hover:bg-[#321b57] text-[#a182d6] border border-transparent",
      userMsg: "bg-[#ff0055] text-white",
      aiMsg: "bg-[#22123b] border border-[#00ffcc]/30 text-[#00ffcc]",
      inputBg: "bg-[#140b24] border-[#00ffcc]/40 text-[#00ffcc] focus:border-[#ff0055]"
    }
  };

  const currentTheme = themeClasses[theme] || themeClasses.dark;

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-200 ${currentTheme.bg}`}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* CONFIRM DELETION MODAL POPUP */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm transition-opacity duration-200">
          <div className={`${theme === 'light' ? 'bg-white text-gray-900 border-gray-200' : 'bg-[#121212] text-white border-neutral-800'} border p-6 rounded-2xl max-w-md w-full shadow-2xl`}>
            <h3 className="text-lg font-bold mb-2">Delete Conversation?</h3>
            <p className={`text-sm mb-6 ${theme === 'light' ? 'text-gray-500' : 'text-neutral-400'}`}>
              Are you sure you want to delete this chat room?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTargetId(null)}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition ${theme === 'light' ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' : 'bg-[#262626] hover:bg-[#333333] text-white'}`}
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteChat}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-xl font-medium text-sm transition shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className={`fixed md:static top-0 left-0 h-full w-72 border-r flex flex-col z-50 transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} ${currentTheme.sidebar}`}>
        <div className="p-4 border-b border-inherit">
          <button onClick={createNewChatSession} className={`w-full py-3 rounded-lg font-semibold transition text-sm ${currentTheme.btnPrimary}`}>
            + New Chat
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-3 border-b border-inherit">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-1 opacity-40">Chat History</div>
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setCurrentChatId(chat.id)}
                className={`group flex items-center justify-between p-2.5 rounded-lg mb-1.5 text-sm font-medium cursor-pointer transition border ${chat.id === currentChatId ? currentTheme.chatRoomActive : currentTheme.chatRoomInactive} ${theme === 'dark' && chat.id !== currentChatId ? 'border-transparent' : ''}`}
              >
                <span className="truncate flex-1 pr-2">💬 {chat.title}</span>
                <button
                  onClick={(e) => confirmDeleteChat(chat.id, e)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-500 p-1 rounded transition text-xs cursor-pointer"
                  title="Delete Chat"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 bg-black/5">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-1 opacity-40">Active Session Queries</div>
            {messages.filter((msg) => msg && msg.role === "user").map((msg, index) => (
              <div key={index} className={`border p-2.5 rounded-md mb-1.5 text-xs truncate ${theme === 'dark' ? 'bg-[#161616]/30 border-neutral-800/40 text-neutral-400' : 'bg-black/10 border-black/10 opacity-80'}`} title={msg.content}>
                🔍 {msg.content}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex flex-col flex-1 w-full overflow-hidden">
        {/* HEADER SECTION */}
        <div className={`h-16 border-b flex items-center justify-between px-4 md:px-6 relative ${currentTheme.header}`}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden text-2xl">☰</button>
            <h1 className="text-lg md:text-xl font-semibold tracking-tight">ChatHub.Ai</h1>
          </div>

          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium cursor-pointer transition ${theme === 'light' ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : theme === 'dark' ? 'bg-[#161616] border border-neutral-800 text-neutral-200 hover:bg-[#222]' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
            >
               Theme <span className="text-xs opacity-50">▼</span>
            </button>

            {themeDropdownOpen && (
              <div className={`absolute right-0 mt-2 w-48 rounded-xl  shadow-2xl p-1.5 border z-[60] ${theme === 'light' ? 'bg-white border-gray-200 text-gray-800' : theme === 'dark' ? 'bg-[#121212] border-neutral-800 text-neutral-200' : 'bg-slate-900 border-slate-800 text-slate-200'}`}>
                <button onClick={() => handleThemeChange("dark")} className={`w-full text-left cursor-pointer px-3 py-2 rounded-lg text-sm ${theme === "dark" ? "bg-[#262626] text-white font-medium" : "hover:bg-white/5"}`}>
                  Dark
                </button>
                <button onClick={() => handleThemeChange("light")} className={`w-full text-left px-3 cursor-pointer py-2 rounded-lg text-sm ${theme === "light" ? "bg-blue-600 text-white font-medium" : "hover:bg-white/5"}`}>
                  Light
                </button>
                <button onClick={() => handleThemeChange("nightRead")} className={`w-full text-left px-3 cursor-pointer py-2 rounded-lg text-sm ${theme === "nightRead" ? "bg-[#eaaa69] text-white font-medium" : "hover:bg-white/5"}`}>
                  Warm
                </button>
                <button onClick={() => handleThemeChange("cyberpunk")} className={`w-full text-left px-3 cursor-pointer py-2 rounded-lg text-sm ${theme === "cyberpunk" ? "bg-[#ff0055] text-white font-medium" : "hover:bg-white/5"}`}>
                  Cyberpunk
                </button>
              </div>
            )}
          </div>
        </div>

        {/* FEED BODY VIEWPORT */}
        <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <h2 className="text-2xl md:text-3xl font-medium opacity-20 text-center tracking-tight">Ask Anything</h2>
            </div>
          )}

          {messages.map((msg, index) => {
            if (!msg) return null;
            return (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div 
                  className={`w-full max-w-[90%] md:max-w-3xl px-4 md:px-5 py-3 ${
                    msg.role === "user" 
                      ? `${currentTheme.userMsg} rounded-2xl` 
                      : `${currentTheme.aiMsg} ${theme === 'dark' ? 'px-0 py-1' : 'rounded-2xl'}`
                  }`}
                >
                  {msg.role === "assistant" ? renderMessageContent(msg.content, index) : msg.content}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className={`${theme === 'dark' ? 'text-neutral-500' : 'opacity-60 text-inherit'} text-sm font-medium`}>Thinking...</div>
            </div>
          )}
          {/* Removed scroll anchor element */}
        </div>

        {/* INPUT SUBMISSION FIELD ROW */}
        <div className="border-t border-inherit p-3 md:p-4">
          <div className="flex gap-2 md:gap-3 max-w-5xl mx-auto">
            <input
              type="text"
              placeholder="Message Search AI..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className={`flex-1 border rounded-xl px-3 md:px-4 py-3 outline-none text-sm md:text-base bg-transparent transition ${currentTheme.inputBg}`}
            />
            <button
              onClick={toggleVoice}
              className={`px-3 md:px-4 rounded-xl font-medium transition ${listening ? "bg-red-600 text-white" : theme === 'dark' ? 'bg-[#161616] text-neutral-400 hover:bg-[#222]' : 'bg-slate-700/40 text-inherit hover:bg-slate-700/60'}`}
              title="Voice Input"
            >
              🎤
            </button>
            <button onClick={handleSend} className={`px-4 md:px-6 rounded-xl font-semibold transition text-sm md:text-base ${currentTheme.btnPrimary}`}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Chat;