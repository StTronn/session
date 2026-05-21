// scripts/build-all.ts — cross-compile standalone binaries for every platform.
import pkg from "../package.json";

const targets = [
  { target: "bun-darwin-arm64", out: "session-macos-arm64" },
  { target: "bun-darwin-x64", out: "session-macos-x64" },
  { target: "bun-linux-x64", out: "session-linux-x64" },
  { target: "bun-windows-x64", out: "session-windows-x64.exe" },
];

console.log(`Building session v${pkg.version} for ${targets.length} targets…`);
for (const t of targets) {
  console.log(`  → dist/${t.out}`);
  const proc = Bun.spawnSync(
    [
      "bun",
      "build",
      "./bin/session.ts",
      "--compile",
      `--target=${t.target}`,
      `--outfile=dist/${t.out}`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (proc.exitCode !== 0) {
    console.error(`build failed for ${t.target}`);
    process.exit(1);
  }
}
console.log("Done — binaries are in dist/");
