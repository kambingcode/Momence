/**
 * Teks tempelan yang tampak seperti link video (YouTube, Twitch) sehingga layak
 * membuka dialog impor. Hanya saringan longgar: validasi lengkap tetap di server saat impor.
 */
export function looksLikeVideoLink(text: string): boolean {
  const value = text.trim();
  if (!value || /\s/.test(value) || value.length > 2048) return false;
  return /^(https?:\/\/)?([\w-]+\.)*(youtube\.com|youtu\.be|twitch\.tv)(\/|$)/i.test(
    value,
  );
}
