const enabled = process.env.VOUCH_DEBUG === 'true';
export function debug(message, data) {
    if (!enabled)
        return;
    const prefix = `[vouch ${new Date().toISOString()}]`;
    if (data !== undefined) {
        process.stderr.write(`${prefix} ${message} ${JSON.stringify(data)}\n`);
    }
    else {
        process.stderr.write(`${prefix} ${message}\n`);
    }
}
