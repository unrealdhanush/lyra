import { Link, Route, Routes } from 'react-router-dom';
import Submit from './pages/Submit.jsx';
import Run from './pages/Run.jsx';
import Gallery from './pages/Gallery.jsx';

export default function App() {
  return (
    <div className="shell">
      <header className="masthead">
        <Link to="/" className="wordmark">
          <span className="seal" />LYRA
        </Link>
        <nav>
          <Link to="/docket">docket</Link>
          <a href="https://github.com/" target="_blank" rel="noreferrer">source</a>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Submit />} />
        <Route path="/r/:slug" element={<Run />} />
        <Route path="/docket" element={<Gallery />} />
      </Routes>
    </div>
  );
}
