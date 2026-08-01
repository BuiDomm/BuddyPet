import { DIALOGUES } from "../content/dialogue";
import type { DialogueIntentId, Locale, PetId, Tone } from "../content/types";

const ui = {
  vi: {
    app: { name: "BuddyPet", tagline: "Một người bạn nhỏ trên desktop" },
    common: { back: "Quay lại", next: "Tiếp tục", done: "Hoàn tất", cancel: "Hủy", save: "Lưu", preview: "Xem thử" },
    tray: {
      summon: "Gọi Buddy",
      hideNow: "Ẩn ngay",
      pause: "Tạm dừng",
      resume: "Tiếp tục",
      meetingMode: "Chế độ họp",
      mute: "Tắt âm",
      unmute: "Bật âm",
      settings: "Cài đặt",
      quit: "Thoát BuddyPet"
    },
    onboarding: {
      languageAndPet: "Chọn ngôn ngữ và Buddy",
      tone: "Chọn cách Buddy trò chuyện",
      intensity: "Chọn mức độ tinh nghịch",
      immersive: "Cho phép hiệu ứng hòa vào màn hình",
      finish: "Thử âm thanh và điều khiển",
      randomRotation: "Luân phiên Buddy ngẫu nhiên",
      captureTitle: "Chỉ chụp một vùng nhỏ trong bộ nhớ",
      captureBody: "Ảnh không được lưu, đọc, ghi log hay gửi đi. Nếu không có quyền, Buddy dùng hiệu ứng hoạt hình.",
      soundOptIn: "Bật hiệu ứng âm thanh",
      autostartOptIn: "Mở BuddyPet cùng máy",
      hotkeyPractice: "Thử phím ẩn khẩn cấp"
    },
    tone: { kind: "Dễ thương", sassy: "Cà khịa" },
    intensity: {
      gentle: "Nhẹ nhàng",
      playful: "Tinh nghịch",
      chaos: "Hỗn loạn",
      recommended: "Đề xuất"
    },
    behavior: {
      fakeDamage: "Hư hỏng giả",
      coverContent: "Che nội dung",
      cursorPlay: "Chơi với con trỏ",
      ambient: "Hành vi thư giãn",
      sfx: "Hiệu ứng âm thanh"
    },
    snooze: { minutes15: "15 phút", minutes30: "30 phút", minutes60: "60 phút", today: "Hôm nay" },
    status: { paused: "Đang tạm dừng", meeting: "Đang trong Chế độ họp", quietHours: "Đang trong giờ yên tĩnh" }
  },
  en: {
    app: { name: "BuddyPet", tagline: "A tiny friend on your desktop" },
    common: { back: "Back", next: "Continue", done: "Done", cancel: "Cancel", save: "Save", preview: "Preview" },
    tray: {
      summon: "Summon Buddy",
      hideNow: "Hide now",
      pause: "Pause",
      resume: "Resume",
      meetingMode: "Meeting Mode",
      mute: "Mute",
      unmute: "Unmute",
      settings: "Settings",
      quit: "Quit BuddyPet"
    },
    onboarding: {
      languageAndPet: "Choose a language and Buddy",
      tone: "Choose how Buddy talks",
      intensity: "Choose a mischief level",
      immersive: "Allow screen-blended effects",
      finish: "Try sound and controls",
      randomRotation: "Rotate Buddies at random",
      captureTitle: "Only a small region is captured in memory",
      captureBody: "Images are never saved, read, logged, or sent. Without permission, Buddy uses a cartoon fallback.",
      soundOptIn: "Enable sound effects",
      autostartOptIn: "Open BuddyPet at login",
      hotkeyPractice: "Practice the emergency-hide shortcut"
    },
    tone: { kind: "Cute", sassy: "Sassy" },
    intensity: { gentle: "Gentle", playful: "Playful", chaos: "Chaos", recommended: "Recommended" },
    behavior: {
      fakeDamage: "Fake damage",
      coverContent: "Cover content",
      cursorPlay: "Cursor play",
      ambient: "Ambient behaviors",
      sfx: "Sound effects"
    },
    snooze: { minutes15: "15 minutes", minutes30: "30 minutes", minutes60: "60 minutes", today: "Today" },
    status: { paused: "Paused", meeting: "Meeting Mode is on", quietHours: "Quiet hours are active" }
  },
  ko: {
    app: { name: "BuddyPet", tagline: "데스크톱 위의 작은 친구" },
    common: { back: "뒤로", next: "계속", done: "완료", cancel: "취소", save: "저장", preview: "미리 보기" },
    tray: {
      summon: "Buddy 부르기",
      hideNow: "지금 숨기기",
      pause: "일시 정지",
      resume: "다시 시작",
      meetingMode: "회의 모드",
      mute: "음소거",
      unmute: "소리 켜기",
      settings: "설정",
      quit: "BuddyPet 종료"
    },
    onboarding: {
      languageAndPet: "언어와 Buddy 선택",
      tone: "Buddy의 말투 선택",
      intensity: "장난 수준 선택",
      immersive: "화면과 어우러지는 효과 허용",
      finish: "소리와 조작 시험하기",
      randomRotation: "Buddy 무작위 교대",
      captureTitle: "메모리에서 작은 영역만 캡처합니다",
      captureBody: "이미지는 저장, 판독, 기록 또는 전송되지 않습니다. 권한이 없으면 만화 효과로 대체됩니다.",
      soundOptIn: "효과음 켜기",
      autostartOptIn: "로그인할 때 BuddyPet 열기",
      hotkeyPractice: "긴급 숨기기 단축키 연습"
    },
    tone: { kind: "다정하게", sassy: "능청스럽게" },
    intensity: { gentle: "차분하게", playful: "장난스럽게", chaos: "혼돈", recommended: "추천" },
    behavior: {
      fakeDamage: "가짜 손상",
      coverContent: "콘텐츠 가리기",
      cursorPlay: "커서 놀이",
      ambient: "잔잔한 행동",
      sfx: "효과음"
    },
    snooze: { minutes15: "15분", minutes30: "30분", minutes60: "60분", today: "오늘" },
    status: { paused: "일시 정지됨", meeting: "회의 모드 사용 중", quietHours: "조용한 시간 사용 중" }
  },
  ja: {
    app: { name: "BuddyPet", tagline: "デスクトップの小さな相棒" },
    common: { back: "戻る", next: "続ける", done: "完了", cancel: "キャンセル", save: "保存", preview: "プレビュー" },
    tray: {
      summon: "Buddyを呼ぶ",
      hideNow: "今すぐ隠す",
      pause: "一時停止",
      resume: "再開",
      meetingMode: "会議モード",
      mute: "ミュート",
      unmute: "ミュート解除",
      settings: "設定",
      quit: "BuddyPetを終了"
    },
    onboarding: {
      languageAndPet: "言語とBuddyを選ぶ",
      tone: "Buddyの話し方を選ぶ",
      intensity: "いたずらレベルを選ぶ",
      immersive: "画面になじむエフェクトを許可",
      finish: "サウンドと操作を試す",
      randomRotation: "Buddyをランダムに交代",
      captureTitle: "メモリ上で小さな範囲だけをキャプチャします",
      captureBody: "画像の保存、読み取り、ログ記録、送信は行いません。権限がない場合は漫画エフェクトを使います。",
      soundOptIn: "効果音を有効にする",
      autostartOptIn: "ログイン時にBuddyPetを開く",
      hotkeyPractice: "緊急非表示ショートカットを試す"
    },
    tone: { kind: "やさしい", sassy: "生意気" },
    intensity: { gentle: "おだやか", playful: "遊び好き", chaos: "カオス", recommended: "おすすめ" },
    behavior: {
      fakeDamage: "偽のダメージ",
      coverContent: "コンテンツを隠す",
      cursorPlay: "カーソル遊び",
      ambient: "のんびりした行動",
      sfx: "効果音"
    },
    snooze: { minutes15: "15分", minutes30: "30分", minutes60: "60分", today: "今日" },
    status: { paused: "一時停止中", meeting: "会議モード中", quietHours: "静かな時間です" }
  }
} as const;

function buildTranslation(locale: Locale) {
  return {
    ...ui[locale],
    dialogue: DIALOGUES[locale]
  };
}

export const resources = {
  vi: { translation: buildTranslation("vi") },
  en: { translation: buildTranslation("en") },
  ko: { translation: buildTranslation("ko") },
  ja: { translation: buildTranslation("ja") }
} as const;

export type DialogueTranslationKey = `dialogue.${PetId}.${DialogueIntentId}.${Tone}`;

export function dialogueTranslationKey(petId: PetId, intent: DialogueIntentId, tone: Tone): DialogueTranslationKey {
  return `dialogue.${petId}.${intent}.${tone}`;
}
