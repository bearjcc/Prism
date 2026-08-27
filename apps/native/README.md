# Native Prism

One installer, two processes:

- `host/`  -  portable engine (policy, mods, DNS/proxy control plane)
- `ui/`  -  tray + windows; unprivileged; IPC only
- `platforms/`  -  OS adapters
- `installer/`  -  Windows first, then Android
