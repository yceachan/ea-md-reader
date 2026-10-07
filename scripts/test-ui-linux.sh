#!/bin/sh
set -eu
export XDG_SESSION_TYPE=x11
export WAYLAND_DISPLAY=
wm_log=$(mktemp)
openbox >"$wm_log" 2>&1 &
wm_pid=$!
trap 'kill "$wm_pid" 2>/dev/null || true; rm -f "$wm_log"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
attempt=0
while true; do
  case $(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null) in *'window id'*) break;; esac
  if ! kill -0 "$wm_pid" 2>/dev/null || [ "$attempt" -ge 50 ]; then
    cat "$wm_log" >&2
    echo '隔离窗口管理器未就绪，请检查 openbox 与 xprop。' >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 0.1
done
"$@"
