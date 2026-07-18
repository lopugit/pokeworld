const log = (...args: unknown[]) => console.log(`[${new Date().toLocaleTimeString()}]`, ...args)

export default log
