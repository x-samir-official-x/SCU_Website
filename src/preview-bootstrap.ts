export const isBrowserPreview = import.meta.env.MODE === 'preview';

export async function preparePreview() {
  if (!('serviceWorker' in navigator)) {
    if (isBrowserPreview)
      throw new Error('المعاينة تحتاج متصفحًا يدعم Service Workers واتصال HTTPS.');
    return;
  }
  if (!isBrowserPreview) {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (registration?.active?.scriptURL.endsWith('/preview-api.js')) {
      await registration.unregister();
      if (navigator.serviceWorker.controller?.scriptURL.endsWith('/preview-api.js'))
        location.reload();
    }
    return;
  }
  await navigator.serviceWorker.register('/preview-api.js', { scope: '/', updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('تعذر بدء المعاينة. أعد تحميل الصفحة.')),
        15000,
      );
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
