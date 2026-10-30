import type { Email } from './mailer';

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(lines: string[], link: string, button: string): string {
  const paragraphs = lines.map((l) => `<p>${escape(l)}</p>`).join('');
  return `<div style="font-family:sans-serif;max-width:480px">${paragraphs}<p><a href="${escape(link)}" style="display:inline-block;padding:10px 16px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px">${escape(button)}</a></p><p style="color:#777;font-size:13px">Si el botón no funciona, copia este link: ${escape(link)}</p></div>`;
}

export function verifyEmail(to: string, name: string, link: string): Email {
  const lines = [
    `Hola ${name}:`,
    'Confirma tu email para terminar de crear tu cuenta en OpenChess. El link vale 24 horas.',
  ];
  return {
    to,
    subject: 'Confirma tu email en OpenChess',
    text: `${lines.join('\n\n')}\n\n${link}`,
    html: layout(lines, link, 'Confirmar email'),
  };
}

export function resetPassword(to: string, name: string, link: string): Email {
  const lines = [
    `Hola ${name}:`,
    'Alguien pidió cambiar la contraseña de tu cuenta en OpenChess. El link vale 1 hora.',
    'Si no fuiste tú, ignora este email: tu contraseña sigue igual.',
  ];
  return {
    to,
    subject: 'Cambia tu contraseña de OpenChess',
    text: `${lines.join('\n\n')}\n\n${link}`,
    html: layout(lines, link, 'Cambiar contraseña'),
  };
}

export function passwordChanged(to: string, name: string, link: string): Email {
  const lines = [
    `Hola ${name}:`,
    'La contraseña de tu cuenta en OpenChess acaba de cambiar y se cerraron tus otras sesiones.',
    'Si no fuiste tú, entra y usa «¿Olvidaste tu contraseña?» para recuperar tu cuenta.',
  ];
  return {
    to,
    subject: 'Tu contraseña de OpenChess cambió',
    text: `${lines.join('\n\n')}\n\n${link}`,
    html: layout(lines, link, 'Ir a OpenChess'),
  };
}

export function confirmEmailChange(
  to: string,
  name: string,
  link: string,
): Email {
  const lines = [
    `Hola ${name}:`,
    'Pediste usar este email en tu cuenta de OpenChess. Confírmalo con el botón; el link vale 24 horas.',
    'Si no fuiste tú, ignora este email: tu cuenta sigue con el email de antes.',
  ];
  return {
    to,
    subject: 'Confirma tu nuevo email en OpenChess',
    text: `${lines.join('\n\n')}\n\n${link}`,
    html: layout(lines, link, 'Confirmar email'),
  };
}

export function emailChanged(
  to: string,
  name: string,
  newEmail: string,
  link: string,
): Email {
  const lines = [
    `Hola ${name}:`,
    `El email de tu cuenta en OpenChess cambió a ${newEmail}. Desde ahora inicias sesión con ese.`,
    'Si no fuiste tú, escríbenos respondiendo a este email.',
  ];
  return {
    to,
    subject: 'El email de tu cuenta de OpenChess cambió',
    text: `${lines.join('\n\n')}\n\n${link}`,
    html: layout(lines, link, 'Ir a OpenChess'),
  };
}
