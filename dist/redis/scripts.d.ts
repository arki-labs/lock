/**
 * KEYS[1] lock key, KEYS[2] fence counter. ARGV[1] token, ARGV[2] ttl in ms.
 * Replies `{ fence, serverNowMs }` on success and `{ 0, 0 }` when held.
 * The fence is bumped only by a winner, in the same step as the win.
 *
 * The key already holding our own token is a win too: ioredis resends a
 * command whose reply was lost to a dropped connection, so this script can
 * run twice for one attempt. The second run gets the fence the first one
 * took (no other winner can have bumped it since) and a fresh ttl.
 */
export declare const ACQUIRE = "\nlocal fence\nif redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then\n  fence = redis.call('INCR', KEYS[2])\nelseif redis.call('GET', KEYS[1]) == ARGV[1] then\n  redis.call('PEXPIRE', KEYS[1], ARGV[2])\n  fence = tonumber(redis.call('GET', KEYS[2])) or redis.call('INCR', KEYS[2])\nelse\n  return { 0, 0 }\nend\nlocal time = redis.call('TIME')\nreturn { fence, tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000) }\n";
/**
 * KEYS[1] lock key. ARGV[1] token, ARGV[2] wake channel.
 * Deletes the key only when the token matches, then wakes waiters.
 * Replies 1 when released, 0 when the caller is not the owner.
 * The channel is an ARGV, not a KEY: ioredis adds a client's `keyPrefix` to
 * KEYS but not to SUBSCRIBE, so a KEY channel would never reach the waiters.
 */
export declare const RELEASE = "\nif redis.call('GET', KEYS[1]) == ARGV[1] then\n  redis.call('DEL', KEYS[1])\n  redis.call('PUBLISH', ARGV[2], '1')\n  return 1\nend\nreturn 0\n";
/**
 * KEYS[1] lock key. ARGV[1] token, ARGV[2] ttl in ms.
 * Resets the expiry only when the token matches. An expired key reads as
 * missing, so a lease that is gone is never revived. Replies 1 or 0.
 */
export declare const EXTEND = "\nif redis.call('GET', KEYS[1]) == ARGV[1] then\n  redis.call('PEXPIRE', KEYS[1], ARGV[2])\n  return 1\nend\nreturn 0\n";
/**
 * KEYS[1] holders ZSET (token scored by expiry), KEYS[2] meta HASH (`limit`, `w:<token>` weights and
 * `f:<token>` fences), KEYS[3] fence counter. ARGV[1] token, ARGV[2] ttl ms, ARGV[3] limit, ARGV[4] weight.
 * Replies `{ fence, serverNowMs }` on a grant, `{ 0, 0 }` when full, `{ -1, 0 }` when the stored
 * limit differs from ARGV[3] while live holders exist (a new limit is taken once none are left).
 * The token already holding a permit is a win again (a resent command): fresh expiry, and the fence it
 * was first given (stored as `f:<token>`), never the counter, which may belong to a later holder.
 */
export declare const PERMIT_ACQUIRE = "\nlocal t = redis.call('TIME')\nlocal now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n\nlocal function keep(zset, other)\n  local top = redis.call('ZREVRANGE', zset, 0, 0, 'WITHSCORES')\n  if top[2] == nil then return end\n  local left = math.max(tonumber(top[2]) - now, 1)\n  redis.call('PEXPIRE', zset, left)\n  if other ~= nil and redis.call('EXISTS', other) == 1 then redis.call('PEXPIRE', other, left) end\nend\n\nlocal dead = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now)\nfor _, token in ipairs(dead) do\n  redis.call('ZREM', KEYS[1], token)\n  redis.call('HDEL', KEYS[2], 'w:' .. token, 'f:' .. token)\nend\nif redis.call('ZCARD', KEYS[1]) == 0 then redis.call('DEL', KEYS[2]) end\nlocal limit = tonumber(ARGV[3])\nlocal stored = redis.call('HGET', KEYS[2], 'limit')\nif stored and tonumber(stored) ~= limit then return { -1, 0 } end\nlocal fence\nif redis.call('ZSCORE', KEYS[1], ARGV[1]) then\n  redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])\n  fence = tonumber(redis.call('HGET', KEYS[2], 'f:' .. ARGV[1])) or redis.call('INCR', KEYS[3])\nelse\n  local used = 0\n  local all = redis.call('HGETALL', KEYS[2])\n  for i = 1, #all, 2 do\n    if string.sub(all[i], 1, 2) == 'w:' then used = used + tonumber(all[i + 1]) end\n  end\n  if used + tonumber(ARGV[4]) > limit then return { 0, 0 } end\n  redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])\n  fence = redis.call('INCR', KEYS[3])\n  redis.call('HSET', KEYS[2], 'limit', ARGV[3], 'w:' .. ARGV[1], ARGV[4], 'f:' .. ARGV[1], fence)\nend\nkeep(KEYS[1], KEYS[2])\nreturn { fence, now }\n";
/**
 * KEYS[1] holders ZSET, KEYS[2] meta HASH. ARGV[1] token, ARGV[2] wake channel.
 * Removes a live holder owned by the token, then wakes waiters. Replies 1 or 0.
 * A holder whose expiry has passed is not an owner any more (as an expired mutex key is gone).
 */
export declare const PERMIT_RELEASE = "\nlocal t = redis.call('TIME')\nlocal now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n\nlocal score = redis.call('ZSCORE', KEYS[1], ARGV[1])\nif not score then return 0 end\nredis.call('ZREM', KEYS[1], ARGV[1])\nredis.call('HDEL', KEYS[2], 'w:' .. ARGV[1], 'f:' .. ARGV[1])\nif redis.call('ZCARD', KEYS[1]) == 0 then redis.call('DEL', KEYS[2]) end\nif tonumber(score) <= now then return 0 end\nredis.call('PUBLISH', ARGV[2], '1')\nreturn 1\n";
/**
 * KEYS[1] holders ZSET, KEYS[2] meta HASH. ARGV[1] token, ARGV[2] ttl ms.
 * Moves a live holder's expiry to now + ttl. An expired holder is never revived. Replies 1 or 0.
 */
export declare const PERMIT_EXTEND = "\nlocal t = redis.call('TIME')\nlocal now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n\nlocal function keep(zset, other)\n  local top = redis.call('ZREVRANGE', zset, 0, 0, 'WITHSCORES')\n  if top[2] == nil then return end\n  local left = math.max(tonumber(top[2]) - now, 1)\n  redis.call('PEXPIRE', zset, left)\n  if other ~= nil and redis.call('EXISTS', other) == 1 then redis.call('PEXPIRE', other, left) end\nend\n\nlocal score = redis.call('ZSCORE', KEYS[1], ARGV[1])\nif not score or tonumber(score) <= now then return 0 end\nredis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])\nkeep(KEYS[1], KEYS[2])\nreturn 1\n";
/**
 * KEYS[1] readers ZSET (token scored by expiry), KEYS[2] writer key (the writer's token, with a TTL),
 * KEYS[3] fence counter, KEYS[4] reader fences HASH (token -> the fence it was given). ARGV[1] token, ARGV[2] ttl ms, ARGV[3] 'read' or 'write'.
 * A reader wins when no writer is live; a writer wins when no writer and no reader is live.
 * Replies `{ fence, serverNowMs }` or `{ 0, 0 }`. The token already holding the lock wins again
 * (a resent command), with a fresh expiry and, for a reader, its own stored fence. Readers are never queued behind a waiting writer here.
 */
export declare const SHARED_ACQUIRE = "\nlocal t = redis.call('TIME')\nlocal now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n\nlocal function keep(zset, other)\n  local top = redis.call('ZREVRANGE', zset, 0, 0, 'WITHSCORES')\n  if top[2] == nil then return end\n  local left = math.max(tonumber(top[2]) - now, 1)\n  redis.call('PEXPIRE', zset, left)\n  if other ~= nil and redis.call('EXISTS', other) == 1 then redis.call('PEXPIRE', other, left) end\nend\n\nlocal dead = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now)\nfor _, token in ipairs(dead) do\n  redis.call('ZREM', KEYS[1], token)\n  redis.call('HDEL', KEYS[4], token)\nend\nlocal fence\nif ARGV[3] == 'read' then\n  if redis.call('ZSCORE', KEYS[1], ARGV[1]) then\n    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])\n    fence = tonumber(redis.call('HGET', KEYS[4], ARGV[1])) or redis.call('INCR', KEYS[3])\n  elseif redis.call('EXISTS', KEYS[2]) == 1 then\n    return { 0, 0 }\n  else\n    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])\n    fence = redis.call('INCR', KEYS[3])\n    redis.call('HSET', KEYS[4], ARGV[1], fence)\n  end\n  keep(KEYS[1], KEYS[4])\nelse\n  if redis.call('GET', KEYS[2]) == ARGV[1] then\n    redis.call('PEXPIRE', KEYS[2], ARGV[2])\n    fence = tonumber(redis.call('GET', KEYS[3])) or redis.call('INCR', KEYS[3])\n  elseif redis.call('EXISTS', KEYS[2]) == 1 or redis.call('ZCARD', KEYS[1]) > 0 then\n    return { 0, 0 }\n  else\n    redis.call('SET', KEYS[2], ARGV[1], 'PX', ARGV[2])\n    fence = redis.call('INCR', KEYS[3])\n  end\nend\nreturn { fence, now }\n";
/**
 * KEYS[1] readers ZSET, KEYS[2] writer key, KEYS[3] reader fences HASH. ARGV[1] token, ARGV[2] wake channel.
 * Releases whichever hold the token owns (tokens are unique per attempt), then wakes waiters.
 * Replies 1 when released, 0 when the token owns no live hold.
 */
export declare const SHARED_RELEASE = "\nlocal t = redis.call('TIME')\nlocal now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n\nif redis.call('GET', KEYS[2]) == ARGV[1] then\n  redis.call('DEL', KEYS[2])\n  redis.call('PUBLISH', ARGV[2], '1')\n  return 1\nend\nlocal score = redis.call('ZSCORE', KEYS[1], ARGV[1])\nif score then\n  redis.call('ZREM', KEYS[1], ARGV[1])\n  redis.call('HDEL', KEYS[3], ARGV[1])\n  if tonumber(score) > now then\n    redis.call('PUBLISH', ARGV[2], '1')\n    return 1\n  end\nend\nreturn 0\n";
/**
 * KEYS[1] readers ZSET, KEYS[2] writer key, KEYS[3] reader fences HASH. ARGV[1] token, ARGV[2] ttl ms.
 * Renews the hold the token owns. An expired hold is never revived. Replies 1 or 0.
 */
export declare const SHARED_EXTEND = "\nlocal t = redis.call('TIME')\nlocal now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n\nlocal function keep(zset, other)\n  local top = redis.call('ZREVRANGE', zset, 0, 0, 'WITHSCORES')\n  if top[2] == nil then return end\n  local left = math.max(tonumber(top[2]) - now, 1)\n  redis.call('PEXPIRE', zset, left)\n  if other ~= nil and redis.call('EXISTS', other) == 1 then redis.call('PEXPIRE', other, left) end\nend\n\nif redis.call('GET', KEYS[2]) == ARGV[1] then\n  redis.call('PEXPIRE', KEYS[2], ARGV[2])\n  return 1\nend\nlocal score = redis.call('ZSCORE', KEYS[1], ARGV[1])\nif not score or tonumber(score) <= now then return 0 end\nredis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])\nkeep(KEYS[1], KEYS[3])\nreturn 1\n";
/**
 * Read-only: would an acquire of ARGV[1] permits fit right now? KEYS[1] holders ZSET, KEYS[2] meta HASH.
 * Counts only holders whose expiry is still ahead. No limit stored (no live holder) means it fits.
 * Replies 1 or 0. Used by waiters to check after they subscribe, so a missed wake-up cannot strand them.
 */
export declare const PERMIT_FITS = "\nlocal t = redis.call('TIME')\nlocal now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n\nlocal limit = tonumber(redis.call('HGET', KEYS[2], 'limit'))\nif not limit then return 1 end\nlocal used = 0\nfor _, token in ipairs(redis.call('ZRANGEBYSCORE', KEYS[1], '(' .. now, '+inf')) do\n  used = used + tonumber(redis.call('HGET', KEYS[2], 'w:' .. token) or '0')\nend\nif used + tonumber(ARGV[1]) > limit then return 0 end\nreturn 1\n";
/**
 * Read-only: would an acquire in mode ARGV[1] ('read' or 'write') succeed right now?
 * KEYS[1] readers ZSET, KEYS[2] writer key. Replies 1 or 0.
 */
export declare const SHARED_FITS = "\nlocal t = redis.call('TIME')\nlocal now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n\nif redis.call('EXISTS', KEYS[2]) == 1 then return 0 end\nif ARGV[1] == 'write' and redis.call('ZCOUNT', KEYS[1], '(' .. now, '+inf') > 0 then return 0 end\nreturn 1\n";
/** A script and the SHA-1 Redis knows it by (for `EVALSHA`). */
export type Script = {
    readonly source: string;
    readonly sha: string;
};
export declare const acquireScript: Script;
export declare const releaseScript: Script;
export declare const extendScript: Script;
export declare const permitAcquireScript: Script;
export declare const permitReleaseScript: Script;
export declare const permitExtendScript: Script;
export declare const sharedAcquireScript: Script;
export declare const sharedReleaseScript: Script;
export declare const sharedExtendScript: Script;
export declare const permitFitsScript: Script;
export declare const sharedFitsScript: Script;
//# sourceMappingURL=scripts.d.ts.map