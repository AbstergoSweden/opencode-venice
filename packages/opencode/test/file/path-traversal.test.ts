import { test, expect, describe } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Filesystem } from "../../src/util/filesystem"
import { File } from "../../src/file"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import os from "os"

describe("Filesystem.contains", () => {
  test("allows paths within project", () => {
    expect(Filesystem.contains("/project", "/project/src")).toBe(true)
    expect(Filesystem.contains("/project", "/project/src/file.ts")).toBe(true)
    expect(Filesystem.contains("/project", "/project")).toBe(true)
  })

  test("blocks ../ traversal", () => {
    expect(Filesystem.contains("/project", "/project/../etc")).toBe(false)
    expect(Filesystem.contains("/project", "/project/src/../../etc")).toBe(false)
    expect(Filesystem.contains("/project", "/etc/passwd")).toBe(false)
  })

  test("blocks absolute paths outside project", () => {
    expect(Filesystem.contains("/project", "/etc/passwd")).toBe(false)
    expect(Filesystem.contains("/project", "/tmp/file")).toBe(false)
    expect(Filesystem.contains("/home/user/project", "/home/user/other")).toBe(false)
  })

  test("handles prefix collision edge cases", () => {
    expect(Filesystem.contains("/project", "/project-other/file")).toBe(false)
    expect(Filesystem.contains("/project", "/projectfile")).toBe(false)
  })
})

/*
 * Integration tests for File.read() and File.list() path traversal protection.
 *
 * These tests verify the HTTP API code path is protected. The HTTP endpoints
 * in server.ts (GET /file/content, GET /file) call File.read()/File.list()
 * directly - they do NOT go through ReadTool or the agent permission layer.
 *
 * This is a SEPARATE code path from ReadTool, which has its own checks.
 */
describe("File.read path traversal protection", () => {
  test("rejects ../ traversal attempting to read /etc/passwd", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "allowed.txt"), "allowed content")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await expect(File.read("../../../etc/passwd")).rejects.toThrow("Access denied: path escapes project directory")
      },
    })
  })

  test("rejects deeply nested traversal", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await expect(File.read("src/nested/../../../../../../../etc/passwd")).rejects.toThrow(
          "Access denied: path escapes project directory",
        )
      },
    })
  })

  test("allows valid paths within project", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "valid.txt"), "valid content")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await File.read("valid.txt")
        expect(result.content).toBe("valid content")
      },
    })
  })

  test("rejects symlink traversal outside project", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        // create a secret file outside
        const secretDir = await fs.mkdtemp(path.join(os.tmpdir(), "secret-"))
        const secretFile = path.join(secretDir, "secret.txt")
        await Bun.write(secretFile, "secret content")

        // create a symlink inside project pointing to secret file
        const linkPath = path.join(dir, "link-to-secret.txt")
        await fs.symlink(secretFile, linkPath)

        return { secretDir, secretFile, linkPath }
      }
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Try to read the symlink
        // Current implementation will allow this because "link-to-secret.txt" is lexically inside tmp.path
        await expect(File.read("link-to-secret.txt")).rejects.toThrow("Access denied: path escapes project directory")
      },
    })

    // Clean up secret dir
    await fs.rm(tmp.extra.secretDir, { recursive: true, force: true })
  })
})

describe("File.list path traversal protection", () => {
  test("rejects ../ traversal attempting to list /etc", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await expect(File.list("../../../etc")).rejects.toThrow("Access denied: path escapes project directory")
      },
    })
  })

  test("allows valid subdirectory listing", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "subdir", "file.txt"), "content")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await File.list("subdir")
        expect(Array.isArray(result)).toBe(true)
      },
    })
  })

  test("rejects symlink traversal outside project in list", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
         // create a secret dir outside
         const secretDir = await fs.mkdtemp(path.join(os.tmpdir(), "secret-dir-"))
         await Bun.write(path.join(secretDir, "secret.txt"), "content")

         // create a symlink inside project pointing to secret dir
         const linkPath = path.join(dir, "link-to-secret-dir")
         await fs.symlink(secretDir, linkPath)

         return { secretDir, linkPath }
      }
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await expect(File.list("link-to-secret-dir")).rejects.toThrow("Access denied: path escapes project directory")
      },
    })

    // Clean up secret dir
    await fs.rm(tmp.extra.secretDir, { recursive: true, force: true })
  })
})
