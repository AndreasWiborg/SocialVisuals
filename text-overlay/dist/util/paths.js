import path from 'path';
import os from 'os';
export function normalizePath(p) {
    if (!p)
        return p;
    let s = p.trim();
    if (s.startsWith('file://'))
        s = s.replace(/^file:\/\//, '');
    if (s.startsWith('~'))
        s = path.join(os.homedir(), s.slice(1));
    if (!path.isAbsolute(s))
        s = path.resolve(process.cwd(), s);
    return s;
}
