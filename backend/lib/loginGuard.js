const FREE_ATTEMPTS = 5;
const MAX_LOCK_MIN = 60;

const lockMinutes = failed => (failed < FREE_ATTEMPTS ? 0 : Math.min(MAX_LOCK_MIN, 2 ** (failed - FREE_ATTEMPTS)));
const lockedFor = (user, now = Date.now()) => Math.max(0, Math.ceil(((user?.lockedUntil?.getTime?.() ?? 0) - now) / 60000));

function failureUpdate(failedBefore, now = Date.now()) {
  const failed = (failedBefore || 0) + 1;
  const min = lockMinutes(failed);
  return { failedLogins: failed, lockedUntil: min ? new Date(now + min * 60000) : null };
}

module.exports = { FREE_ATTEMPTS, lockMinutes, lockedFor, failureUpdate };
