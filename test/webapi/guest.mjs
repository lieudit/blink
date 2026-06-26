const BASE = 0x400000;
const EHSIZE = 64;
const PHSIZE = 56;

export function makeElf(code) {
  const total = EHSIZE + PHSIZE + code.length;
  const buf = Buffer.alloc(total);
  buf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0); // magic, 64-bit, LE, SysV
  buf.writeUInt16LE(2, 16); // e_type = ET_EXEC
  buf.writeUInt16LE(62, 18); // e_machine = x86-64
  buf.writeUInt32LE(1, 20); // e_version
  buf.writeBigUInt64LE(BigInt(BASE + EHSIZE + PHSIZE), 24); // e_entry
  buf.writeBigUInt64LE(BigInt(EHSIZE), 32); // e_phoff
  buf.writeUInt16LE(EHSIZE, 52); // e_ehsize
  buf.writeUInt16LE(PHSIZE, 54); // e_phentsize
  buf.writeUInt16LE(1, 56); // e_phnum

  buf.writeUInt32LE(1, EHSIZE + 0); // p_type = PT_LOAD
  buf.writeUInt32LE(5, EHSIZE + 4); // p_flags = R+X
  buf.writeBigUInt64LE(0n, EHSIZE + 8); // p_offset
  buf.writeBigUInt64LE(BigInt(BASE), EHSIZE + 16); // p_vaddr
  buf.writeBigUInt64LE(BigInt(BASE), EHSIZE + 24); // p_paddr
  buf.writeBigUInt64LE(BigInt(total), EHSIZE + 32); // p_filesz
  buf.writeBigUInt64LE(BigInt(total), EHSIZE + 40); // p_memsz
  buf.writeBigUInt64LE(0x1000n, EHSIZE + 48); // p_align
  buf.set(code, EHSIZE + PHSIZE);
  return buf;
}

export const ENTRY = BASE + EHSIZE + PHSIZE;

// e_entry from an ELF64 header (offset 24, little-endian u64).
export const entryOf = (elf) => Number(Buffer.from(elf).readBigUInt64LE(24));

// mov edi, code; mov eax, 231 (exit_group); syscall
export const exitWith = (code) =>
  makeElf([0xbf, code & 0xff, 0, 0, 0, 0xb8, 0xe7, 0, 0, 0, 0x0f, 0x05]);

// ud2 -> illegal instruction -> SIGILL (4)
export const illegal = () => makeElf([0x0f, 0x0b]);

// mov eax,1; xor edx,edx; xor ecx,ecx; div ecx -> #DE -> SIGFPE (8)
export const divideByZero = () =>
  makeElf([0xb8, 1, 0, 0, 0, 0x31, 0xd2, 0x31, 0xc9, 0xf7, 0xf1]);
