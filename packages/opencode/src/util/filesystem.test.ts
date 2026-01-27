import { describe, expect, test } from "bun:test"
import { Filesystem } from "./filesystem"
import path from "path"

describe("Filesystem.contains", () => {
  test("returns true for child in parent", () => {
    expect(Filesystem.contains("/a/b", "/a/b/c")).toBe(true)
  })

  test("returns false for parent in child", () => {
    expect(Filesystem.contains("/a/b/c", "/a/b")).toBe(false)
  })

  test("returns false for sibling", () => {
    expect(Filesystem.contains("/a/b", "/a/c")).toBe(false)
  })

  test("returns true for same path", () => {
    expect(Filesystem.contains("/a/b", "/a/b")).toBe(true)
  })

  test("returns true for child with trailing slash in parent", () => {
    expect(Filesystem.contains("/a/b/", "/a/b/c")).toBe(true)
  })
})

describe("Filesystem.contains (Windows logic simulation)", () => {
  // This test simulates the logic used in Filesystem.contains but using path.win32
  // to verify that the fix correctly handles cross-drive paths.

  const containsWin32 = (parent: string, child: string) => {
    const rel = path.win32.relative(parent, child)
    return !rel.startsWith("..") && !path.win32.isAbsolute(rel)
  }

  test("returns true for child in parent (same drive)", () => {
    expect(containsWin32("C:\\a\\b", "C:\\a\\b\\c")).toBe(true)
  })

  test("returns false for parent in child (same drive)", () => {
    expect(containsWin32("C:\\a\\b\\c", "C:\\a\\b")).toBe(false)
  })

  test("returns false for different drives", () => {
    expect(containsWin32("C:\\a\\b", "D:\\a\\b\\c")).toBe(false)
  })

  test("returns false for different drives (root)", () => {
    expect(containsWin32("C:\\", "D:\\")).toBe(false)
  })
})
