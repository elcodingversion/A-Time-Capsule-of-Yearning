/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const melancholicQuotes: Record<number, string> = {
  1: "Merawat rindu itu murni tentang kesunyian, seperti menyiram tanaman plastik di sudut kamar kosong yang tak kunjung tumbuh.",
  2: "Ada jarak yang sengaja kita bentangkan, bukan untuk saling melupakan, melainkan untuk menguji seberapa tabah ingatan bertahan.",
  3: "Sore berganti malam, namun porsi rindu ini tetap utuh, tidak berkurang selapis pun meski digerus sunyi yang teramat bising.",
  4: "Membiasakan diri tanpa kabarmu adalah bagian tersulit dari mencintai dalam keheningan mendalam.",
  5: "Hari kelima, dan namamu masih menjadi doa pertama yang meluncur sebelum aku sempat mendoakan diriku sendiri.",
  6: "Kita adalah dua kutub yang dipisahkan oleh takdir, menatap langit yang sama namun menyimpan mimpi yang sepenuhnya berbeda.",
  7: "Mencintaimu kembali terasa bagaikan membaca buku lama; aku sudah tahu akhirnya akan patah, namun tetap kubaca bab per bab.",
  8: "Sunyi ini bukan karena ketiadaan suara, melainkan karena ketiadaan senyummu di ujung senja waktu luangku.",
  9: "Mengikhlaskan bukan berarti menghapus ingatan, namun memandang masa lalu dengan senyum tipis tanpa menyalahkan keadaan.",
  10: "Rindu ini menjelma sebagai pendaran cahaya redup di langit kamar, bersinar hanya untuk memberi tanda bahwa aku masih peduli.",
  11: "Barangkali kita hanya sepasang pejalan yang berpapasan sebentar di halte kecil, lalu kembali naik ke gerbong kereta yang berbeda arah.",
  12: "Setiap cangkir kopi yang kuseduh di meja tersisa rasa getir, persis kalimat perpisahan yang tak sempat tuntas kau sampaikan.",
  13: "Jika rindu adalah sebatang lilin kecil, ia sudah mencair sejak lama, namun hangat sumbunya masih membara di dasar ingatan.",
  14: "Menanti kabar darimu kini rasanya seperti menanti rintik gerimis pertama di padang gersang yang terbakar siang.",
  15: "Esok atau lusa, ketika rindu ini tak lagi berpijar sekuat hari ini, ketahuilah bahwa merawat bayangmu adalah ibadah sunyi yang tulus.",
  
  // ==========================================
  // PLACEHOLDER UNTUK MENERUSKANNYA HINGGA DAY 100
  // Silakan edit bagian di bawah untuk menambahkan quotes personal Anda sendiri.
  // ==========================================
  /*
  16: "...",
  17: "...",
  ...
  100: "..."
  */
};

// Helper function to safely get quote for any day up to Day 100.
// If the quote is not defined yet, we generate or fallback to a poetic placeholder
export function getMelancholicQuote(day: number): string {
  if (melancholicQuotes[day]) {
    return melancholicQuotes[day];
  }
  
  // Fallback melancholic generator if user goes beyond Day 15 up to Day 100 without filling quotes
  const fallbacks = [
    `Ingatan tentangmu terus bersemi meski hari telah berganti menjadi hari-hari sunyi tanpa hadirmu.`,
    `Di lubuk sunyi ini, aku masih bersetia mengeja namamu bersama hembusan angin malam yang dingin.`,
    `Ada damai yang perlahan hinggap di dada, seiring rindu yang kini tak lagi menuntut balasan apa-apa.`,
    `Kita mungkin tak ditakdirkan bersama, namun kisah kita terpatri kokoh di antara gugusan bintang rindu ini.`,
    `Menerima ketiadaanmu adalah proses sunyi yang panjang, dieja pelan-pelan bersama detak jarum jam malam.`,
    `Matahari terbit lagi di balik bukit, mengingatkanku bahwa hidup terus berjalan, pun rindu yang mengalir tanpa henti.`,
    `Setiap bait puisi rindu yang kutuliskan adalah jembatan imajiner yang membentang dari mataku ke senyummu.`
  ];
  const index = (day - 1) % fallbacks.length;
  return `[Day ${day}] ${fallbacks[index]}`;
}
