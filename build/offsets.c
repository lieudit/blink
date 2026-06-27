#include <stddef.h>
#include <stdio.h>

#include "blink/machine.h"

static int g_first = 1;

static void emit(const char *name, size_t off) {
  printf("%s\n  \"%s\": %zu", g_first ? "" : ",", name, off);
  g_first = 0;
}

int main(void) {
  int i;
  char name[8];
  static const char *const gpr[16] = {
      "rax", "rcx", "rdx", "rbx", "rsp", "rbp", "rsi", "rdi",
      "r8",  "r9",  "r10", "r11", "r12", "r13", "r14", "r15"};
  size_t weg = offsetof(struct Machine, weg);
  size_t xmm = offsetof(struct Machine, xmm);
  printf("{");
  emit("rip", offsetof(struct Machine, ip));
  emit("flags", offsetof(struct Machine, flags));
  for (i = 0; i < 16; ++i) emit(gpr[i], weg + i * 8);
  for (i = 0; i < 16; ++i) {
    snprintf(name, sizeof(name), "xmm%d", i);
    emit(name, xmm + i * 16);
  }
  emit("sizeof", sizeof(struct Machine));
  printf("\n}\n");
  return 0;
}
