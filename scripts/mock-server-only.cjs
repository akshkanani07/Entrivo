// Allow server-only imports to resolve cleanly in Node/tsx scripts outside Next.js
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === "server-only") {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

