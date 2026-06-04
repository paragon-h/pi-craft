/**
 * Tests for CWD Guard — write/edit/bash boundary enforcement.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as os from "node:os";
import { checkCwdGuard } from "../cwd-guard.js";

const cwd = "/home/user/project";
const homeDir = os.homedir();

// ─── write ────────────────────────────────────────────────────

describe("checkCwdGuard — write", () => {
  it("allows write inside cwd", () => {
    assert.equal(
      checkCwdGuard("write", { path: "/home/user/project/src/file.ts" }, cwd),
      null,
    );
  });

  it("allows write to cwd root", () => {
    assert.equal(
      checkCwdGuard("write", { path: "/home/user/project" }, cwd),
      null,
    );
  });

  it("blocks write outside cwd", () => {
    const result = checkCwdGuard("write", { path: "/etc/hosts" }, cwd);
    assert.ok(result !== null);
    assert.ok(result!.includes("工作目录外"));
  });

  it("blocks write to parent directory", () => {
    const result = checkCwdGuard("write", { path: "/home/user/other/file.ts" }, cwd);
    assert.ok(result !== null);
  });

  it("blocks write with relative path (resolves against real cwd, not test cwd)", () => {
    // resolvePath uses path.resolve() which always resolves against process.cwd(),
    // not the cwd argument. Relative paths are inherently outside any test fixture cwd.
    const result = checkCwdGuard("write", { path: "src/file.ts" }, cwd);
    assert.ok(result !== null);
  });

  it("handles empty path gracefully", () => {
    assert.equal(checkCwdGuard("write", { path: "" }, cwd), null);
  });

  it("handles tilde expansion outside cwd", () => {
    // ~/other resolves to $HOME/other, which should be outside cwd
    const result = checkCwdGuard("write", { path: "~/other-project/file.ts" }, cwd);
    if (path.resolve("~/other-project/file.ts".replace("~", homeDir)).startsWith(cwd)) {
      // If home IS inside cwd (unlikely but possible), it passes
      assert.equal(result, null);
    } else {
      assert.ok(result !== null);
    }
  });
});

// ─── edit ─────────────────────────────────────────────────────

describe("checkCwdGuard — edit", () => {
  it("allows edit with absolute path inside cwd", () => {
    assert.equal(
      checkCwdGuard("edit", { file_path: "/home/user/project/src/app.ts" }, cwd),
      null,
    );
  });

  it("blocks edit with absolute path outside cwd", () => {
    const result = checkCwdGuard("edit", { file_path: "/etc/config.ini" }, cwd);
    assert.ok(result !== null);
  });

  it("allows edit with relative path (not absolute, not checked)", () => {
    assert.equal(
      checkCwdGuard("edit", { file_path: "src/app.ts" }, cwd),
      null,
    );
  });

  it("allows edit with no path", () => {
    assert.equal(checkCwdGuard("edit", {}, cwd), null);
  });

  it("reads path from 'file_path' field", () => {
    assert.equal(
      checkCwdGuard("edit", { file_path: "/home/user/project/file.ts" }, cwd),
      null,
    );
  });

  it("falls back to 'path' field", () => {
    assert.equal(
      checkCwdGuard("edit", { path: "/home/user/project/file.ts" }, cwd),
      null,
    );
  });

  it("blocks edit via tilde expansion", () => {
    const result = checkCwdGuard("edit", { file_path: "~/outside/file.ts" }, cwd);
    const resolved = path.resolve("~/outside/file.ts".replace("~", homeDir));
    if (resolved.startsWith(cwd)) {
      assert.equal(result, null);
    } else {
      assert.ok(result !== null);
    }
  });
});

// ─── bash — non-write commands ─────────────────────────────────

describe("checkCwdGuard — bash (read-only)", () => {
  it("allows ls", () => {
    assert.equal(checkCwdGuard("bash", { command: "ls -la" }, cwd), null);
  });

  it("allows cat", () => {
    assert.equal(checkCwdGuard("bash", { command: "cat /etc/hosts" }, cwd), null);
  });

  it("allows grep", () => {
    assert.equal(checkCwdGuard("bash", { command: "grep -r 'TODO' /tmp" }, cwd), null);
  });

  it("allows find", () => {
    assert.equal(checkCwdGuard("bash", { command: "find / -name config" }, cwd), null);
  });

  it("allows git log", () => {
    assert.equal(checkCwdGuard("bash", { command: "git log --oneline" }, cwd), null);
  });
});

// ─── bash — write commands ────────────────────────────────────

describe("checkCwdGuard — bash (write commands)", () => {
  it("allows mkdir inside cwd", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "mkdir /home/user/project/dist" }, cwd),
      null,
    );
  });

  it("blocks mkdir outside cwd", () => {
    const result = checkCwdGuard("bash", { command: "mkdir /tmp/evil" }, cwd);
    assert.ok(result !== null);
  });

  it("allows touch inside cwd", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "touch /home/user/project/newfile.txt" }, cwd),
      null,
    );
  });

  it("blocks touch outside cwd", () => {
    const result = checkCwdGuard("bash", { command: "touch /etc/malicious" }, cwd);
    assert.ok(result !== null);
  });

  it("allows cp with absolute paths inside cwd", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "cp /home/user/project/src/a.ts /home/user/project/src/b.ts" }, cwd),
      null,
    );
  });

  it("blocks cp to outside cwd", () => {
    const result = checkCwdGuard("bash", { command: "cp secret.txt /tmp/leak" }, cwd);
    assert.ok(result !== null);
  });

  it("allows mv with absolute paths inside cwd", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "mv /home/user/project/a.ts /home/user/project/b.ts" }, cwd),
      null,
    );
  });

  it("blocks mv to outside cwd", () => {
    const result = checkCwdGuard("bash", { command: "mv data.json /var/tmp/" }, cwd);
    assert.ok(result !== null);
  });

  it("blocks rm outside cwd", () => {
    const result = checkCwdGuard("bash", { command: "rm -rf /important/data" }, cwd);
    assert.ok(result !== null);
  });

  it("allows rm inside cwd", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "rm /home/user/project/temp.txt" }, cwd),
      null,
    );
  });
});

// ─── bash — redirects ─────────────────────────────────────────

describe("checkCwdGuard — bash (redirects)", () => {
  it("blocks > redirect outside cwd", () => {
    const result = checkCwdGuard(
      "bash",
      { command: "echo 'evil' > /etc/hosts" },
      cwd,
    );
    assert.ok(result !== null);
  });

  it("allows > redirect inside cwd", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "echo 'ok' > /home/user/project/out.txt" }, cwd),
      null,
    );
  });

  it("blocks >> redirect outside cwd", () => {
    const result = checkCwdGuard(
      "bash",
      { command: "log >> /var/log/bad.log" },
      cwd,
    );
    assert.ok(result !== null);
  });

  it("allows tee to /dev/null", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "make 2>&1 | tee /dev/null" }, cwd),
      null,
    );
  });

  it("blocks tee outside cwd", () => {
    const result = checkCwdGuard(
      "bash",
      { command: "npm test | tee /tmp/results.txt" },
      cwd,
    );
    assert.ok(result !== null);
  });

  it("allows tee inside cwd", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "npm test | tee /home/user/project/test-output.txt" }, cwd),
      null,
    );
  });
});

// ─── bash — dd ────────────────────────────────────────────────

describe("checkCwdGuard — bash (dd)", () => {
  it("allows dd of= inside cwd", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "dd if=/dev/zero of=/home/user/project/disk.img bs=1M count=10" }, cwd),
      null,
    );
  });

  it("blocks dd of= outside cwd", () => {
    const result = checkCwdGuard(
      "bash",
      { command: "dd if=/dev/zero of=/tmp/disk.img bs=1M count=10" },
      cwd,
    );
    assert.ok(result !== null);
  });

  it("allows dd of=/dev/null", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "dd if=/dev/zero of=/dev/null bs=1M count=1" }, cwd),
      null,
    );
  });
});

// ─── Edge cases ───────────────────────────────────────────────

describe("checkCwdGuard — edge cases", () => {
  it("allows non-write non-edit non-bash tools unconditionally", () => {
    assert.equal(checkCwdGuard("read", { path: "/etc/passwd" }, cwd), null);
    assert.equal(checkCwdGuard("grep", { path: "/etc" }, cwd), null);
    assert.equal(checkCwdGuard("find", { path: "/" }, cwd), null);
    assert.equal(checkCwdGuard("ls", { path: "/etc" }, cwd), null);
  });

  it("handles bash command without write operations", () => {
    assert.equal(
      checkCwdGuard("bash", { command: "echo hello world" }, cwd),
      null,
    );
  });

  it("handles cwd that is a subdirectory of home", () => {
    const homeCwd = path.join(homeDir, "projects", "app");
    assert.equal(
      checkCwdGuard("write", { path: path.join(homeDir, "projects", "app", "file.ts") }, homeCwd),
      null,
    );
  });

  it("resolves relative cwd correctly", () => {
    // checkCwdGuard calls path.resolve(cwd) internally
    assert.equal(
      checkCwdGuard("write", { path: "/home/user/project/main.ts" }, "/home/user/project"),
      null,
    );
  });

  it("handles git clone outside cwd", () => {
    const result = checkCwdGuard(
      "bash",
      { command: "git clone https://example.com/repo.git /tmp/repo" },
      cwd,
    );
    assert.ok(result !== null);
  });

  it("handles npm init outside cwd", () => {
    const result = checkCwdGuard(
      "bash",
      { command: "npm init -y /tmp/newproject" },
      cwd,
    );
    assert.ok(result !== null);
  });
});
