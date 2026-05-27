import React, { useState, useEffect } from 'react';
import './App.css';
import {
  HeartPulse, ChevronRight, Moon, Sun,
  ArrowLeft, Plus, Send, LogOut
} from 'lucide-react';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // State to manage which page we are on ('home', 'chat', 'login', 'signup')
  const [currentView, setCurrentView] = useState('home');
  // State for the chat input box
  const [chatInput, setChatInput] = useState('');

  // Splash Screen State
  const [showSplash, setShowSplash] = useState(true);

  // Expert Modal State
  const [showExpertModal, setShowExpertModal] = useState(false);

  useEffect(() => {
    // Hide splash screen after 3 seconds
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({
    username: '',
    email: '',
    password: '',
    isDoctor: false,
    doctorField: 'General Medicine'
  });

  // Expert Queries state
  const [expertQueries, setExpertQueries] = useState([]);

  // Chat History state
  const [conversations, setConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);

  const currentConversation = conversations.find(c => c.id === activeChatId);
  const messages = currentConversation ? currentConversation.messages : [];

  // Load user session on mount
  useEffect(() => {
    const sessionUser = localStorage.getItem('healhive_session');
    if (sessionUser) {
      const user = JSON.parse(sessionUser);
      setCurrentUser(user);
    }

    const savedQueries = localStorage.getItem('healhive_expert_queries');
    if (savedQueries) {
      setExpertQueries(JSON.parse(savedQueries));
    }
  }, []);

  // Load chat history when switching to chat view
  useEffect(() => {
    if (currentView === 'chat') {
      const historyKey = currentUser ? `healhive_chats_${currentUser.username}` : 'healhive_chats_guest';
      const historyStr = localStorage.getItem(historyKey);

      let parsedHistory = [];
      if (historyStr) {
        try {
          parsedHistory = JSON.parse(historyStr);
        } catch (e) {
          parsedHistory = [];
        }
      }

      // Migration: if it's the old format (array of messages), wrap it
      if (parsedHistory.length > 0 && !parsedHistory[0].id) {
        parsedHistory = [
          {
            id: 'legacy-chat-1',
            title: 'Previous Conversation',
            messages: parsedHistory
          }
        ];
        localStorage.setItem(historyKey, JSON.stringify(parsedHistory));
      }

      setConversations(parsedHistory);
      // Default to empty new chat
      setActiveChatId(null);
    }
  }, [currentView, currentUser]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const handleAuthChange = (e) => {
    let value;
    if (e.target.type === 'checkbox') {
      value = e.target.checked;
    } else {
      value = e.target.value;
    }
    setAuthForm({ ...authForm, [e.target.name]: value });
    setAuthError('');
  };

  const handleSignup = (e) => {
    e.preventDefault();
    if (!authForm.username || !authForm.email || !authForm.password) {
      setAuthError('All fields are required.');
      return;
    }

    const usersStr = localStorage.getItem('healhive_users');
    let users = usersStr ? JSON.parse(usersStr) : [];

    // Check unique email and username
    if (users.some(u => u.email === authForm.email)) {
      setAuthError('Email already in use.');
      return;
    }
    if (users.some(u => u.username === authForm.username)) {
      setAuthError('Username already taken.');
      return;
    }

    const newUser = {
      username: authForm.username,
      email: authForm.email,
      password: authForm.password,
      isDoctor: authForm.isDoctor,
      doctorField: authForm.isDoctor ? authForm.doctorField : null
    };
    users.push(newUser);
    localStorage.setItem('healhive_users', JSON.stringify(users));

    // Auto-login after signup
    setCurrentUser(newUser);
    localStorage.setItem('healhive_session', JSON.stringify(newUser));
    setCurrentView('home');
    setAuthForm({ username: '', email: '', password: '', isDoctor: false, doctorField: 'General Medicine' });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!authForm.username || !authForm.password) {
      setAuthError('Username and password are required.');
      return;
    }

    const usersStr = localStorage.getItem('healhive_users');
    let users = usersStr ? JSON.parse(usersStr) : [];

    const user = users.find(u => u.username === authForm.username && u.password === authForm.password);
    if (!user) {
      setAuthError('Invalid username or password.');
      return;
    }

    setCurrentUser(user);
    localStorage.setItem('healhive_session', JSON.stringify(user));
    setCurrentView('home');
    setAuthForm({ username: '', email: '', password: '', isDoctor: false, doctorField: 'General' });
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('healhive_session');
    setCurrentView('home');
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    const messageText = chatInput.trim();

    if (!messageText) return;

    const userMessageObj = { text: messageText, sender: 'user', timestamp: new Date().toISOString() };

    let chatId = activeChatId;
    let updatedConversations = [...conversations];
    let chatIndex = updatedConversations.findIndex(c => c.id === chatId);

    if (chatIndex === -1) {
      chatId = 'chat_' + Date.now();
      const newChat = {
        id: chatId,
        title: messageText.substring(0, 30) + (messageText.length > 30 ? '...' : ''),
        messages: [userMessageObj]
      };
      updatedConversations.unshift(newChat);
      setActiveChatId(chatId);
    } else {
      updatedConversations[chatIndex] = {
        ...updatedConversations[chatIndex],
        messages: [...updatedConversations[chatIndex].messages, userMessageObj]
      };
    }

    setConversations(updatedConversations);
    setChatInput('');

    const historyKey = currentUser ? `healhive_chats_${currentUser.username}` : 'healhive_chats_guest';
    localStorage.setItem(historyKey, JSON.stringify(updatedConversations));

    try {
      const response = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: messageText }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiResponseText = data.reply || "No response content received.";
        const aiMessageObj = { text: aiResponseText, sender: 'ai', timestamp: new Date().toISOString() };

        let finalConversations = [...updatedConversations];
        let fIndex = finalConversations.findIndex(c => c.id === chatId);
        if (fIndex !== -1) {
          finalConversations[fIndex] = {
            ...finalConversations[fIndex],
            messages: [...finalConversations[fIndex].messages, aiMessageObj]
          };
          setConversations(finalConversations);
          localStorage.setItem(historyKey, JSON.stringify(finalConversations));
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Render Splash Screen
  if (showSplash) {
    return (
      <div className={`splash-screen ${isDarkMode ? 'dark-theme' : ''}`}>
        <div className="ambient-bg">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
        </div>
        <div className="splash-content">
          <div className="splash-logo">
            <HeartPulse size={80} className="splash-icon highlight" />
          </div>
          <h1 className="splash-title">
            Heal<span className="highlight">Hive</span> AI
          </h1>
          <p className="splash-subtitle">Your Personal Health Assistant</p>
          <div className="loading-bar-container">
            <div className="loading-bar"></div>
          </div>
        </div>
      </div>
    );
  }

  // Render Auth Views
  if (currentView === 'login' || currentView === 'signup') {
    const isLogin = currentView === 'login';
    return (
      <div className={`app-container auth-layout ${isDarkMode ? 'dark-theme' : ''}`}>
        <div className="ambient-bg">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
        </div>

        <header className="auth-header">
          <button onClick={() => setCurrentView('home')} className="icon-btn" aria-label="Go Back">
            <ArrowLeft size={24} />
          </button>
          <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle Dark Mode">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        <main className="auth-body">
          <div className="auth-card">
            <div className="auth-logo">
              <HeartPulse size={40} className="highlight pulse" />
              <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
            </div>
            {authError && <div className="auth-error">{authError}</div>}

            <form onSubmit={isLogin ? handleLogin : handleSignup} className="auth-form">
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text" name="username" value={authForm.username}
                  onChange={handleAuthChange} placeholder="Enter username"
                />
              </div>

              {!isLogin && (
                <>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email" name="email" value={authForm.email}
                      onChange={handleAuthChange} placeholder="Enter email"
                    />
                  </div>
                  <div className="form-group checkbox-group">
                    <label>
                      <input
                        type="checkbox" name="isDoctor"
                        checked={authForm.isDoctor} onChange={handleAuthChange}
                      />
                      I am a medical professional
                    </label>
                  </div>
                  {authForm.isDoctor && (
                    <>
                      <div className="form-group">
                        <label>Medical Specialty</label>
                        <select name="doctorField" value={authForm.doctorField} onChange={handleAuthChange} className="chat-input" style={{ width: '100%', marginBottom: '1rem', padding: '0.8rem', borderRadius: '0.75rem', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--glass-border)' }}>
                          <option value="General Medicine">General Medicine</option>
                          <option value="Neurology">Neurology</option>
                          <option value="Cardiology">Cardiology</option>
                          <option value="Pulmonology">Pulmonology</option>
                          <option value="Gastroenterology">Gastroenterology</option>
                          <option value="Infectious Disease">Infectious Disease</option>
                          <option value="Dermatology">Dermatology</option>
                          <option value="Orthopedics">Orthopedics</option>
                          <option value="Endocrinology">Endocrinology</option>
                          <option value="Psychiatry">Psychiatry</option>
                          <option value="Pediatrics">Pediatrics</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Upload Medical Certificate</label>
                        <input type="file" className="file-input" style={{ marginBottom: '1rem', color: 'var(--text-main)' }} />
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password" name="password" value={authForm.password}
                  onChange={handleAuthChange} placeholder="Enter password"
                />
              </div>

              <button type="submit" className="btn-large flex-center w-100">
                {isLogin ? 'Log In' : 'Sign Up'}
              </button>
            </form>

            <div className="auth-switch">
              {isLogin ? (
                <p>Don't have an account? <span onClick={() => { setAuthError(''); setCurrentView('signup'); }}>Sign up</span></p>
              ) : (
                <p>Already have an account? <span onClick={() => { setAuthError(''); setCurrentView('login'); }}>Log in</span></p>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (currentView === 'chat') {
    return (
      <div className={`app-container chat-layout ${isDarkMode ? 'dark-theme' : ''}`}>
        <div className="ambient-bg">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
        </div>

        {/* Sidebar */}
        <aside className="chat-sidebar">
          <button className="new-chat-btn" onClick={() => setActiveChatId(null)}>
            <Plus size={18} /> New Chat
          </button>

          <div className="chat-history-list">
            {conversations.map(chat => (
              <div
                key={chat.id}
                className={`chat-history-item ${chat.id === activeChatId ? 'active' : ''}`}
                onClick={() => setActiveChatId(chat.id)}
              >
                {chat.title}
              </div>
            ))}
          </div>
        </aside>

        {/* Main Chat Area */}
        <div className="chat-main">
          {/* Chat Header */}
          <header className="chat-header">
            <div className="chat-header-left">
              <button onClick={() => setCurrentView('home')} className="icon-btn" aria-label="Go Back">
                <ArrowLeft size={24} />
              </button>
              <div className="chat-brand">
                <HeartPulse size={20} className="highlight" />
                <span className="font-bold">HealHive AI</span>
                <span className="guest-badge">{currentUser ? currentUser.username : 'Guest'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {currentUser && !currentUser.isDoctor && messages.length > 0 && (
                <button onClick={() => setShowExpertModal(true)} className="btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                  Consult Expert
                </button>
              )}
              <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle Dark Mode">
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </header>

          {/* chatbody*/}
          <main className="chat-body">
            {messages.length === 0 ? (
              <div className="chat-empty-state">
                <div className="empty-icon-wrapper">
                  <HeartPulse size={48} />
                </div>
                <h2>How can I help you today?</h2>
                <p>I can help you understand symptoms, provide wellness tips, or answer general health questions.</p>
              </div>
            ) : (
              <div className="chat-messages-container">
                {messages.map((msg, index) => (
                  <div key={index} className={`chat-message ${msg.sender === 'user' ? 'message-user' : 'message-ai'}`}>
                    {msg.sender !== 'user' && (
                      <div className="message-avatar" style={msg.sender === 'expert' ? { background: 'linear-gradient(135deg, #00ffa6, #00ff2a)' } : {}}>
                        <HeartPulse size={16} />
                      </div>
                    )}
                    <div className="message-content" style={msg.sender === 'system' ? { background: 'var(--primary-faint)', borderColor: 'var(--primary-light)', fontStyle: 'italic', color: 'var(--text-muted)' } : msg.sender === 'expert' ? { background: 'rgba(0, 255, 166, 0.05)', borderColor: 'rgba(0, 255, 166, 0.3)' } : {}}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>

          {/* chatbox */}
          <footer className="chat-footer">
            <form className="chat-input-wrapper" onSubmit={handleChatSubmit}>
              <button type="button" className="icon-btn tool-btn" aria-label="Add attachment or tool">
                <Plus size={22} />
              </button>

              <input
                type="text"
                placeholder="Message HealHive AI..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="chat-input"
              />

              <button type="submit" className="icon-btn send-btn" aria-label="Send Message" disabled={!chatInput.trim()}>
                <Send size={20} />
              </button>
            </form>
            <div className="chat-disclaimer">
              HealHive AI can make mistakes. Consider verifying important health information.
            </div>
          </footer>
        </div>

        {/* Expert Modal */}
        {showExpertModal && (
          <div className="modal-overlay" onClick={() => setShowExpertModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <button className="close-btn" onClick={() => setShowExpertModal(false)}>
                <Plus size={20} style={{ transform: 'rotate(45deg)' }} />
              </button>
              <h2 className="modal-title" style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Consult a Specialist</h2>
              <p className="modal-subtitle" style={{ marginBottom: '1.5rem' }}>We will send a summary of your current chat history to an expert in the selected field.</p>
              <form onSubmit={e => {
                e.preventDefault();
                const field = e.target.field.value;

                // Create transcript
                const transcript = messages.map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n\n');

                const newQuery = {
                  id: 'query_' + Date.now(),
                  chatId: activeChatId,
                  username: currentUser?.username || 'Guest',
                  field,
                  chatSummary: transcript,
                  timestamp: new Date().toISOString(),
                  responses: []
                };

                const updated = [newQuery, ...expertQueries];
                setExpertQueries(updated);
                localStorage.setItem('healhive_expert_queries', JSON.stringify(updated));

                // Add system message
                const sysMessageObj = { text: `We've sent a summary of our conversation to a ${field} specialist. They will respond here shortly.`, sender: 'system', timestamp: new Date().toISOString() };

                let updatedConversations = [...conversations];
                let chatIndex = updatedConversations.findIndex(c => c.id === activeChatId);
                if (chatIndex !== -1) {
                  updatedConversations[chatIndex].messages.push(sysMessageObj);
                  setConversations(updatedConversations);
                  const historyKey = `healhive_chats_${currentUser.username}`;
                  localStorage.setItem(historyKey, JSON.stringify(updatedConversations));
                }

                setShowExpertModal(false);
              }}>
                <div className="form-group">
                  <label>Select Category</label>
                  <select name="field" className="chat-input" style={{ width: '100%', padding: '0.8rem', borderRadius: '0.75rem', background: 'var(--bg-surface)', color: 'var(--text-main)', border: '1px solid var(--glass-border)' }}>
                    <option value="General Medicine">General Medicine</option>
                    <option value="Neurology">Neurology</option>
                    <option value="Cardiology">Cardiology</option>
                    <option value="Pulmonology">Pulmonology</option>
                    <option value="Gastroenterology">Gastroenterology</option>
                    <option value="Infectious Disease">Infectious Disease</option>
                    <option value="Dermatology">Dermatology</option>
                    <option value="Orthopedics">Orthopedics</option>
                    <option value="Endocrinology">Endocrinology</option>
                    <option value="Psychiatry">Psychiatry</option>
                    <option value="Pediatrics">Pediatrics</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.8rem', marginTop: '1rem' }}>Send to Expert</button>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  }



  // Doctor Dashboard View
  if (currentView === 'doctor_dashboard') {
    return (
      <div className={`app-container ${isDarkMode ? 'dark-theme' : ''}`}>
        <div className="ambient-bg">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
        </div>
        <header className="chat-header">
          <div className="chat-header-left">
            <button onClick={() => setCurrentView('home')} className="icon-btn" aria-label="Go Back">
              <ArrowLeft size={24} />
            </button>
            <div className="chat-brand">
              <HeartPulse size={20} className="highlight" />
              <span className="font-bold">Doctor Dashboard ({currentUser?.doctorField})</span>
            </div>
          </div>
          <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle Dark Mode">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>
        <main className="main-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem' }}>
          <div style={{ width: '100%', maxWidth: '800px' }}>
            <h2 style={{ color: 'var(--text-main)', marginBottom: '1.5rem' }}>Open Queries in {currentUser?.doctorField}</h2>
            {expertQueries.filter(q => q.field === currentUser?.doctorField).length === 0 ? (
              <div className="auth-card" style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>No open queries in your field at the moment.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {expertQueries.filter(q => q.field === currentUser?.doctorField).map(q => {
                  const hasResponded = q.responses.some(r => r.doctorName === currentUser.username);
                  return (
                    <div key={q.id} className="query-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Consultation requested by {q.username} on {new Date(q.timestamp).toLocaleDateString()}</span>
                      </div>
                      <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                        <pre style={{ color: 'var(--text-main)', fontSize: '0.9rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{q.chatSummary}</pre>
                      </div>

                      {hasResponded ? (
                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--primary-faint)', borderRadius: '0.5rem', border: '1px solid var(--primary-light)' }}>
                          <p style={{ color: 'var(--primary)', fontWeight: 'bold' }}>You have responded to this query.</p>
                        </div>
                      ) : (
                        <form onSubmit={(e) => {
                          e.preventDefault();
                          const responseText = e.target.response.value;
                          if (!responseText.trim()) return;

                          const updatedQueries = expertQueries.map(query => {
                            if (query.id === q.id) {
                              return {
                                ...query,
                                responses: [...query.responses, {
                                  doctorName: currentUser.username,
                                  doctorEmail: currentUser.email,
                                  responseText
                                }]
                              };
                            }
                            return query;
                          });
                          setExpertQueries(updatedQueries);
                          localStorage.setItem('healhive_expert_queries', JSON.stringify(updatedQueries));

                          // Inject response into user's chat history
                          const userChatKey = `healhive_chats_${q.username}`;
                          const userChatsStr = localStorage.getItem(userChatKey);
                          if (userChatsStr) {
                            let userChats = JSON.parse(userChatsStr);
                            const cIndex = userChats.findIndex(c => c.id === q.chatId);
                            if (cIndex !== -1) {
                              userChats[cIndex].messages.push({
                                sender: 'expert',
                                text: `Expert Response: ${responseText}\n\nContact Email: ${currentUser.email}`,
                                timestamp: new Date().toISOString()
                              });
                              localStorage.setItem(userChatKey, JSON.stringify(userChats));
                            }
                          }
                          alert("Response sent directly to the user's chat!");
                        }}>
                          <textarea name="response" rows="3" className="chat-input" placeholder="Write your expert response..." style={{ width: '100%', padding: '0.8rem', borderRadius: '0.75rem', background: 'var(--bg-surface)', color: 'var(--text-main)', border: '1px solid var(--glass-border)', resize: 'vertical', marginBottom: '0.5rem' }}></textarea>
                          <button type="submit" className="btn-primary" style={{ padding: '0.6rem 1.2rem' }}>Send Response</button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`app-container ${isDarkMode ? 'dark-theme' : ''}`}>
      <div className="ambient-bg">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
      </div>

      {/* nav  */}
      <header className="header">
        <nav className="nav-bar">
          <div className="logo-section">
            <div className="logo-icon">
              <HeartPulse size={24} />
            </div>
            <span className="logo-text">
              Heal<span className="highlight">Hive</span>
            </span>
          </div>

          <div className="nav-actions">
            {currentUser && currentUser.isDoctor && (
              <button onClick={() => setCurrentView('doctor_dashboard')} className="btn-primary" style={{ marginRight: '0.5rem' }}>Doctor Dashboard</button>
            )}

            {currentUser ? (
              <div className="user-menu">
                <span className="welcome-text">Hi, {currentUser.isDoctor ? 'Dr. ' : ''}{currentUser.username}</span>
                <button onClick={handleLogout} className="icon-btn" aria-label="Logout" title="Logout">
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <div className="auth-buttons">
                <button onClick={() => setCurrentView('login')} className="btn-secondary">Login</button>
                <button onClick={() => setCurrentView('signup')} className="btn-primary">Sign Up</button>
              </div>
            )}
            <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle Dark Mode">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </nav>
      </header>

      {/* main sec */}
      <main className="main-content">
        <div className="hero-section">

          <div className="hero-text">
            <span className="welcome-badge">
              <span className="pulse-dot"></span>
              24/7 Intelligent Support
            </span>
            <h1 className="hero-title">
              Your Personal AI <br />
              <span className="text-gradient">Health Assistant.</span>
            </h1>
            <p className="hero-subtitle">
              Instantly check symptoms, get personalized wellness tips, and find answers to your health questions securely and effortlessly.
            </p>

            <div className="hero-buttons">
              <button onClick={() => setCurrentView('chat')} className="btn-large flex-center">
                Start Chatting Now
                <ChevronRight className="chevron-icon" size={20} />
              </button>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-card">
              <div className="card-icon">
                <HeartPulse size={48} className="activity-icon" />
              </div>
              <h3>Instant AI Analysis</h3>
              <p>Understanding your symptoms accurately and precisely.</p>
            </div>
          </div>

        </div>
      </main>

    </div>
  );
}

export default App;