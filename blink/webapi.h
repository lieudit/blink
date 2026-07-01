#ifndef BLINK_WEBAPI_H_
#define BLINK_WEBAPI_H_
#include <stdint.h>

#include "blink/types.h"

enum BlinkStatus {
  kBlinkOk = 0,
  kBlinkExited = 1,
  kBlinkTrapped = 2,
  kBlinkNoProgram = -1,
  kBlinkError = -2,
};

int blink_init(void);
int blink_load(const char *);
int blink_step(void);
long blink_continue(long);
void blink_reset(void);
uintptr_t blink_machine(void);
double blink_pc(void);
int blink_status(void);
int blink_exit_code(void);
int blink_signal(void);
long blink_disasm(double, int, char *, long);
char *blink_argv_ptr(void);
int *blink_argc_ptr(void);

typedef void (*BlinkSignalHandler)(int);
void blink_set_signal_handler(BlinkSignalHandler);

#endif /* BLINK_WEBAPI_H_ */
