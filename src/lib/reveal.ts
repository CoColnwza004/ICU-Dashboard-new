import { useEffect, useRef } from 'react';

/* แอนิเมชันเมื่อเลื่อนมาถึง: ใช้ IntersectionObserver ตัวเดียวร่วมกันทั้งหน้า (เบาเครื่อง) */
let io: IntersectionObserver | null = null;
const getObserver = () => {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io!.unobserve(e.target); // แสดงครั้งเดียว ไม่ต้องติดตามต่อ
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  return io;
};

/** ใส่ ref ให้ element ที่มี class "reveal" → ค่อย ๆ ปรากฏเมื่อเลื่อนมาถึง */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const obs = getObserver();
    if (!el) return;
    if (!obs) {
      el.classList.add('is-in');
      return;
    }
    obs.observe(el);
    return () => obs.unobserve(el);
  }, []);
  return ref;
}
