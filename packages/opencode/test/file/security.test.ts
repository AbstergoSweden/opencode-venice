import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, symlink, rm } from "fs/promises";
import { join } from "path";
import { File } from "../../src/file/index";
import { Instance } from "../../src/project/instance";

const TEST_DIR = "/tmp/opencode-vuln-repro";
const PROJECT_DIR = join(TEST_DIR, "project");
const OUTSIDE_FILE = join(TEST_DIR, "outside.txt");
const SYMLINK_FILE = join(PROJECT_DIR, "symlink.txt");

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  await mkdir(PROJECT_DIR, { recursive: true });
  await writeFile(OUTSIDE_FILE, "secret content");
  await symlink(OUTSIDE_FILE, SYMLINK_FILE);
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

test("should prevent reading file outside project via symlink", async () => {
  await Instance.provide({
    directory: PROJECT_DIR,
    fn: async () => {
      // Trying to read the symlink which points outside
      try {
        const content = await File.read("symlink.txt");
        console.log("Content read:", content);
        // If we reach here, and content is "secret content", vulnerability exists (or not blocked).
        // The goal is to ensure it throws "Access denied".
        expect(content.content).not.toBe("secret content");
      } catch (e: any) {
        console.log("Caught error:", e.message);
        expect(e.message).toContain("Access denied");
      }
    },
  });
});

test("should prevent listing directory outside project via symlink", async () => {
  await Instance.provide({
    directory: PROJECT_DIR,
    fn: async () => {
      // Create a symlink to outside dir
      const outsideDir = join(TEST_DIR, "outside_dir");
      await mkdir(outsideDir, { recursive: true });
      const symlinkDir = join(PROJECT_DIR, "symlink_dir");
      await symlink(outsideDir, symlinkDir);

      try {
        const nodes = await File.list("symlink_dir");
        console.log("Nodes listed:", nodes);
        // If we reach here, vulnerability exists (or not blocked).
        expect(true).toBe(false);
      } catch (e: any) {
        console.log("Caught error listing:", e.message);
        expect(e.message).toContain("Access denied");
      }
    },
  });
});
