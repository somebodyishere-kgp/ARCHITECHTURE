export interface KeybindingEntry {
  keys: string;
  action: string;
  scope?: 'app' | 'plans' | '3d';
}

export interface KeybindingGroup {
  title: string;
  entries: KeybindingEntry[];
}

export const PLANS_SINGLE_KEY_SHORTCUTS: Record<string, string> = {
  l: 'line',
  w: 'wall',
  c: 'circle',
  a: 'arc',
  m: 'move',
  s: 'select',
  p: 'polyline',
  r: 'rectangle',
  t: 'text',
  n: 'dimension',
  e: 'ellipse',
  h: 'pan',
};

export const KEYBINDING_GROUPS: KeybindingGroup[] = [
  {
    title: 'App Navigation',
    entries: [
      { keys: '1', action: 'Open 2D Plans tab', scope: 'app' },
      { keys: '2', action: 'Open 3D tab', scope: 'app' },
      { keys: '3', action: 'Open Documentation tab', scope: 'app' },
      { keys: '4', action: 'Open Keybindings tab', scope: 'app' },
      { keys: 'Ctrl+S', action: 'Save project', scope: 'app' },
      { keys: 'Ctrl+O', action: 'Open project', scope: 'app' },
      { keys: 'Ctrl+N', action: 'New project', scope: 'app' },
    ],
  },
  {
    title: 'Plans Core',
    entries: [
      { keys: 'S', action: 'Select tool', scope: 'plans' },
      { keys: 'L', action: 'Line', scope: 'plans' },
      { keys: 'P', action: 'Polyline', scope: 'plans' },
      { keys: 'R', action: 'Rectangle', scope: 'plans' },
      { keys: 'C', action: 'Circle', scope: 'plans' },
      { keys: 'A', action: 'Arc', scope: 'plans' },
      { keys: 'W', action: 'Wall', scope: 'plans' },
      { keys: 'M', action: 'Move', scope: 'plans' },
      { keys: 'T', action: 'Text', scope: 'plans' },
      { keys: 'N', action: 'Dimension', scope: 'plans' },
      { keys: 'E', action: 'Ellipse', scope: 'plans' },
      { keys: 'H', action: 'Pan', scope: 'plans' },
    ],
  },
  {
    title: 'Plans Editing',
    entries: [
      { keys: 'Esc', action: 'Cancel current command and clear selection', scope: 'plans' },
      { keys: 'Delete', action: 'Delete selected entities', scope: 'plans' },
      { keys: 'Ctrl+A', action: 'Select all entities', scope: 'plans' },
      { keys: 'Ctrl+Z', action: 'Undo', scope: 'plans' },
      { keys: 'Ctrl+Y', action: 'Redo', scope: 'plans' },
      { keys: 'F3', action: 'Toggle endpoint snap', scope: 'plans' },
      { keys: 'F7', action: 'Toggle grid snap', scope: 'plans' },
      { keys: 'F8', action: 'Toggle ortho mode', scope: 'plans' },
      { keys: 'Right Click', action: 'Finish multipoint tools', scope: 'plans' },
    ],
  },
  {
    title: '3D Workflow',
    entries: [
      { keys: 'Drag', action: 'Orbit camera', scope: '3d' },
      { keys: 'Middle Mouse', action: 'Pan camera', scope: '3d' },
      { keys: 'Scroll', action: 'Zoom camera', scope: '3d' },
      { keys: 'W A S D', action: 'Walkthrough navigation', scope: '3d' },
      { keys: 'Q / E', action: 'Walkthrough vertical movement', scope: '3d' },
    ],
  },
];
