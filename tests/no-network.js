// Preloaded into the scripts a test runs, so a merge never asks a real site for its published pages.
globalThis.fetch = async () => { throw new Error('offline'); };
