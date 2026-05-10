/**
 * 把用户瞎拼的文件名归一成「干净 base」（不含扩展名）。
 * 处理两类典型脏数据：
 *  - 多重扩展名链：「xxx.kgm.flac」/「xxx.kgm.flac.mp3」→「xxx」
 *  - macOS 副本编号：「xxx (1).flac」→「xxx」
 *
 * 上层调用方拿到 base 后自己拼真实格式后缀，避免输出「xxx.kgm.flac.mp3」这种垃圾名字。
 */
export function stripFileExtensions(name: string): string {
  return name
    // 去尾部连续多个 .xxx 扩展名（2-5 ASCII 字母/数字，能覆盖 ncm/kgm/vpr/kgg/flac/ogg/mp3/wav/m4a）
    .replace(/(\.[a-z0-9]{2,5})+$/i, '')
    // 去 macOS 副本标记「 (1)」「(10)」之类
    .replace(/\s*\(\d+\)\s*$/, '')
    // 副本编号去掉后尾部可能又冒出扩展名链，再去一次
    .replace(/(\.[a-z0-9]{2,5})+$/i, '')
    .trim()
}
