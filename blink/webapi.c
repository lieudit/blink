#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

#include "blink/assert.h"
#include "blink/bus.h"
#include "blink/dis.h"
#include "blink/flag.h"
#include "blink/high.h"
#include "blink/linux.h"
#include "blink/loader.h"
#include "blink/log.h"
#include "blink/machine.h"
#include "blink/map.h"
#include "blink/overlays.h"
#include "blink/signal.h"
#include "blink/syscall.h"
#include "blink/util.h"
#include "blink/webapi.h"
#include "blink/x86.h"
#include "blink/xlat.h"

extern char **environ;
extern char *g_blink_path;

static bool g_inited;
static int g_status;
static int g_signal;
static char g_path[1024];
static struct Dis g_dis[1];

EXPORT int blink_init(void) {
  if (g_inited) return 0;
  g_high.enabled = false;
  GetStartDir();
  WriteErrorInit();
  InitMap();
#ifndef DISABLE_OVERLAYS
  if (!FLAG_overlays) FLAG_overlays = getenv("BLINK_OVERLAYS");
  if (!FLAG_overlays) FLAG_overlays = DEFAULT_OVERLAYS;
  if (SetOverlays(FLAG_overlays, true)) return kBlinkError;
#endif
  InitBus();
  g_inited = true;
  return 0;
}

static void ProgramLimit(struct System *s, int hresource, int gresource) {
  struct rlimit rlim;
  if (!getrlimit(hresource, &rlim)) {
    XlatRlimitToLinux(s->rlim + gresource, &rlim);
  }
}

EXPORT int blink_load(const char *prog) {
  int i;
  char *argv[2];
  struct Machine *m;
  if (!g_inited && blink_init()) return kBlinkError;
  if (g_machine) blink_reset();
  if (!Commandv(prog, g_path, sizeof(g_path))) return kBlinkNoProgram;
  g_blink_path = g_path;
  if (!(g_machine = m = NewMachine(NewSystem(XED_MACHINE_MODE_LONG), 0))) {
    return kBlinkError;
  }
  m->system->trapexit = true;
  argv[0] = g_path;
  argv[1] = 0;
  LoadProgram(m, g_path, g_path, argv, environ, NULL);
  SetupCod(m);
  for (i = 0; i < 10; ++i) AddStdFd(&m->system->fds, i);
  ProgramLimit(m->system, RLIMIT_NOFILE, RLIMIT_NOFILE_LINUX);
  g_status = kBlinkOk;
  g_signal = 0;
  return 0;
}

void TerminateSignal(struct Machine *m, int sig, int code) {
  g_signal = sig;
  m->system->exitcode = 128 + sig;
  m->trapno = sig;
  unassert(m->canhalt);
  siglongjmp(m->onhalt, sig);
}

EXPORT int blink_step(void) {
  int rc;
  struct Machine *m = g_machine;
  if (!m) return kBlinkNoProgram;
  if (g_status != kBlinkOk) return g_status;
  if (!(rc = sigsetjmp(m->onhalt, 1))) {
    m->canhalt = true;
    LoadInstruction(m, GetPc(m));
    ExecuteInstruction(m);
    m->canhalt = false;
    return kBlinkOk;
  }
  m->canhalt = false;
  m->sysdepth = 0;
  m->sigdepth = 0;
  m->nofault = false;
  m->insyscall = false;
  CollectPageLocks(m);
  CollectGarbage(m, 0);
  g_status = m->trapno == kMachineExitTrap ? kBlinkExited : kBlinkTrapped;
  return g_status;
}

EXPORT long blink_continue(long max) {
  long n = 0;
  while ((max <= 0 || n < max) && blink_step() == kBlinkOk) ++n;
  return n;
}

EXPORT void blink_reset(void) {
  if (g_machine) {
    FreeMachine(g_machine);
    g_machine = 0;
  }
  g_status = kBlinkOk;
  g_signal = 0;
}

EXPORT uintptr_t blink_machine(void) {
  return (uintptr_t)g_machine;
}

EXPORT double blink_pc(void) {
  return g_machine ? (double)GetPc(g_machine) : -1;
}

EXPORT int blink_status(void) {
  return g_machine ? g_status : kBlinkNoProgram;
}

EXPORT int blink_exit_code(void) {
  return g_machine ? g_machine->system->exitcode : -1;
}

EXPORT int blink_signal(void) {
  return g_signal;
}

EXPORT long blink_disasm(double addr, int lines, char *out, long cap) {
  long i, n = 0, k;
  i64 at = (i64)addr;
  struct Machine *m = g_machine;
  if (!m || cap <= 0) return -1;
  DisFree(g_dis);
  if (Dis(g_dis, m, at, m->ip, lines) == -1) return -1;
  if ((i = DisFind(g_dis, at)) == -1) return -1;
  out[0] = 0;
  for (; i < g_dis->ops.i && lines > 0; ++i, --lines) {
    k = snprintf(out + n, cap - n, "%s\n", DisGetLine(g_dis, m, i));
    if (k < 0 || n + k >= cap) break;
    n += k;
  }
  return n;
}
