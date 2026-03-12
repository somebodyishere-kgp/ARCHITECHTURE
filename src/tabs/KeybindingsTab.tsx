import React from 'react';
import { Keyboard } from 'lucide-react';
import { KEYBINDING_GROUPS } from '../lib/keybindings';
import './KeybindingsTab.css';

export default function KeybindingsTab() {
  return (
    <div className="keybindings-tab">
      <div className="keybindings-hero">
        <div className="keybindings-icon">
          <Keyboard size={18} />
        </div>
        <div>
          <h2>Keybindings</h2>
          <p>Core shortcuts for navigation, drafting, editing, and 3D walkthrough.</p>
        </div>
      </div>

      <div className="keybindings-grid">
        {KEYBINDING_GROUPS.map((group) => (
          <section key={group.title} className="keybindings-card">
            <div className="keybindings-card-title">{group.title}</div>
            <div className="keybindings-list">
              {group.entries.map((entry) => (
                <div key={`${group.title}-${entry.keys}-${entry.action}`} className="keybinding-row">
                  <div className="keybinding-action">
                    <div>{entry.action}</div>
                    <span>{entry.scope ?? 'app'}</span>
                  </div>
                  <kbd>{entry.keys}</kbd>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
