import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const evalsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(evalsDir, '..');
const workspace = path.join(evalsDir, '.workspaces', 'current');
const skillSource = path.join(repoDir, 'skills');
const skillTarget = path.join(workspace, '.claude', 'skills');

fs.rmSync(workspace, { recursive: true, force: true });
fs.cpSync(skillSource, skillTarget, { recursive: true });
execFileSync('git', ['init', '--quiet'], { cwd: workspace });

console.log(`Copied skills/ into ${workspace}`);
