# Working rules for this repo (Bluvia)

## Use multiple agents, without collisions (standing instruction from the owner)

Whenever the owner says "use multiple agents", and also by default in this repo whenever the work can be split, do it with several agents running in parallel. Never let their work collide.

How to keep work from colliding:
1. **Split by files.** Give every agent its own explicit list of files it may edit. No file belongs to two agents. Shared files (for example `src/components/ui.jsx`, `src/index.css`, `tailwind.config.js`, `package.json`, `firestore.rules`, `src/data/api.js`) are changed by ONE owner only, or by the main session before the agents start.
2. **Build the shared foundation first.** If agents depend on a function, component or token, create it (and commit it) before spawning them, so nobody waits on or overwrites someone else.
3. **Reviewers and testers are read-only.** Agents that review or test must not edit repo files. They report findings; the main session (or one designated fixer per file group) applies fixes afterwards.
4. **Separate machines resources.** Parallel agents that run builds or servers must use their own build output folder (`vite build --outDir <their own folder>`, never `./dist`) and their own emulator and preview ports (never the defaults 9099, 8080, 5173, 4400, 4500, 9150). Configure Firebase emulator ports per agent (`websocketPort`, `hub`, `logging` too) and set `VITE_EMULATOR_AUTH_PORT` and `VITE_EMULATOR_FIRESTORE_PORT` for the app build. Kill only processes you started, with a pattern that cannot match your own shell (for example `pkill -f "[v]ite --port 5210"`).
5. **No git from sub-agents.** Agents do not commit or push. The main session commits and pushes, then opens one PR.
6. **Tell each agent**: its file list, what it must NOT touch, how to verify (which commands), and a short report format. Also say which function names, props or menu labels other agents rely on, so names match.
7. **Integrate and verify in the main session.** After the agents finish, run the full unit tests, the emulator tests and the build, then do a browser check, before merging.
8. If a task is small or tightly coupled (one file, one function), do it directly instead of forcing agents.

## Other repo conventions

- Money is stored as integer paise everywhere (`src/lib/money.js`). Never use float rupees in stored data.
- Balance logic lives in `src/lib/ledger.js` and is covered by unit tests; every write goes through `planChange(s)` with `increment()` deltas in one batch or transaction.
- Unit tests: `npm test`. Emulator end-to-end tests: `npm run test:emulator`.
- Visible UI text: no emoji, no em-dash or en-dash, Phosphor icons only. Replies to the owner are in Hinglish (Roman letters); files written for AI discussions are in English.
- Do not edit skill files unless the owner explicitly insists.
