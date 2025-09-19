let warned = false;
export function countGraphemes(s) {
    if (process.env.USE_GRAPHEMES === '1') {
        try {
            // @ts-ignore
            const { Graphemer } = require('graphemer');
            const splitter = new Graphemer();
            return splitter.splitGraphemes(s).length;
        }
        catch {
            if (!warned) {
                // eslint-disable-next-line no-console
                console.warn('[graphemes] graphemer not installed; falling back to length');
                warned = true;
            }
        }
    }
    return s.length;
}
