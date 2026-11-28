// ActionDialog shell. On phone the old px-12 + two fixed w-40 buttons
// (~320px) overflowed a ~390px viewport, so Confirm Delete looked jumbled
// (owner 2026-11-27). Desktop keeps the wide centered card.

export function actionDialogShellClass(): string {
  return 'relative my-6 mx-3 sm:mx-auto w-auto sm:w-[600px] max-w-full';
}

export function actionDialogBodyClass(): string {
  return (
    'flex flex-col justify-center items-center ' +
    'py-6 px-4 sm:py-8 sm:px-12 gap-6 sm:gap-8 rounded-t'
  );
}

export function actionDialogTitleClass(): string {
  return 'font-medium text-lg sm:text-xl text-beaming-orange text-center';
}

export function actionDialogMessageClass(): string {
  return 'font-medium text-sm sm:text-base text-off-white text-center';
}

export function actionDialogButtonsRowClass(): string {
  return (
    'w-full flex flex-col-reverse sm:flex-row items-stretch sm:items-center ' +
    'justify-between gap-3 sm:gap-4'
  );
}

export function actionDialogButtonClass(
  type: 'submit' | 'cancel' | 'delete'
): string {
  const tone =
    type === 'submit'
      ? 'bg-beaming-orange text-black'
      : type === 'cancel'
        ? 'bg-black text-white'
        : 'bg-solid-red text-white';
  return (
    'flex-1 min-w-0 px-3 py-3 font-semibold rounded-lg text-sm ' +
    'hover:cursor-pointer text-center ' +
    tone
  );
}
