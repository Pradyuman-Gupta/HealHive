const fs = require('fs');
let c = fs.readFileSync('src/App.css', 'utf8');
const idx = c.indexOf('.hero-title {\r\n    font-size: 5rem;\r\n  }\r\n}');
if (idx !== -1) {
  c = c.substring(0, idx + 43);
} else {
  const idx2 = c.indexOf('font-size: 5rem;');
  if (idx2 !== -1) {
    c = c.substring(0, c.indexOf('}', c.indexOf('}', idx2) + 1) + 1);
  }
}

const appendix = `
/* =========================================
   WATER WAVES EFFECT
   ========================================= */
.wave {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100px;
  background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg"><path fill="rgba(0, 240, 255, 0.15)" d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,170.7C672,181,768,235,864,245.3C960,256,1056,224,1152,197.3C1248,171,1344,149,1392,138.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path></svg>');
  background-size: 1000px 100px;
}

.wave.wave1 {
  animation: animateWave 15s linear infinite;
  z-index: 1000;
  opacity: 1;
  background-position-y: 10px;
}

.wave.wave2 {
  animation: animateWave 10s linear infinite reverse;
  z-index: 999;
  opacity: 0.5;
  background-position-y: 15px;
  background-size: 1200px 100px;
  background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg"><path fill="rgba(255, 0, 85, 0.1)" d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,170.7C672,181,768,235,864,245.3C960,256,1056,224,1152,197.3C1248,171,1344,149,1392,138.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path></svg>');
}

.wave.wave3 {
  animation: animateWave 20s linear infinite;
  z-index: 998;
  opacity: 0.2;
  background-size: 800px 100px;
}

.dark-theme .wave.wave1 { background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg"><path fill="rgba(0, 255, 42, 0.15)" d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,170.7C672,181,768,235,864,245.3C960,256,1056,224,1152,197.3C1248,171,1344,149,1392,138.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path></svg>'); }
.dark-theme .wave.wave2 { background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg"><path fill="rgba(0, 255, 166, 0.1)" d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,170.7C672,181,768,235,864,245.3C960,256,1056,224,1152,197.3C1248,171,1344,149,1392,138.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path></svg>'); }
.dark-theme .wave.wave3 { background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg"><path fill="rgba(0, 255, 42, 0.1)" d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,170.7C672,181,768,235,864,245.3C960,256,1056,224,1152,197.3C1248,171,1344,149,1392,138.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path></svg>'); }

@keyframes animateWave {
  0% { background-position-x: 0; }
  100% { background-position-x: 1000px; }
}
`;

fs.writeFileSync('src/App.css', c + appendix);
