# Política de privacidad de OpenChess

**Última actualización:** [FECHA]

Esta política explica qué datos personales trata OpenChess, para qué, con quién los compartimos y cómo puedes ejercer tus derechos. Está escrita conforme a la Ley N° 19.628 sobre Protección de la Vida Privada y a la Ley N° 21.719, que la modifica y crea la Agencia de Protección de Datos Personales.

## 1. Quién es el responsable

- **Responsable:** [RAZÓN SOCIAL], RUT [RUT], con domicilio en [DIRECCIÓN], Chile.
- **Contacto para temas de datos personales:** [EMAIL DE PRIVACIDAD].
- [SI SE DESIGNA: Delegado de protección de datos: [NOMBRE Y EMAIL].]

**Clubes y academias:** cada club decide a quién invita, qué rol le da, qué partidas se juegan y qué FIDE ID asigna a sus miembros. Para esos datos, el club actúa como responsable y OpenChess como encargado que los trata por su cuenta. Para los datos de tu cuenta (email, contraseña, sesiones), el responsable es OpenChess.

## 2. Qué datos tratamos

Pedimos lo mínimo para que el servicio funcione. **No pedimos** RUT, fecha de nacimiento, dirección, teléfono ni fotografía.

| Datos                                                                                                    | De dónde vienen                                              |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Email, nombre visible y contraseña (guardada solo como hash argon2id, nunca en claro)                    | Los das al registrarte                                       |
| Si confirmaste tu email                                                                                  | Al usar el link que te enviamos                              |
| Clubes a los que perteneces y tu rol en cada uno                                                         | El club                                                      |
| Partidas jugadas en OpenChess (jugadas, resultado, reloj) y tu rating e historial en el ranking del club | Tu uso del servicio                                          |
| Usuario de Lichess o Chess.com, tus ratings en esas plataformas y las partidas que importes al club      | Tú, al vincularlas (son datos que esas plataformas publican) |
| FIDE ID y lo público de tu ficha FIDE: nombre, federación, título y Elo                                  | Un admin del club, desde ratings.fide.com                    |
| Si el club tiene el plan Pro: email de quien paga, identificador y estado de la suscripción              | Mercado Pago                                                 |
| Datos técnicos: dirección IP (para limitar intentos de inicio de sesión) y registros del servidor        | Tu conexión                                                  |

## 3. Para qué los usamos y con qué base legal

| Finalidad                                                                                       | Base legal                                                                                    |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Crear y mantener tu cuenta, iniciar sesión, confirmar tu email y recuperar tu contraseña        | Ejecución del contrato (los Términos de uso)                                                  |
| Que juegues partidas, aparezcas en el ranking del club y los miembros vean tu perfil en el club | Ejecución del contrato                                                                        |
| Vincular tus cuentas de Lichess o Chess.com e importar tus partidas                             | Tu consentimiento, que puedes retirar desvinculando la cuenta                                 |
| Mostrar tu Elo FIDE en el club y usarlo como rating inicial                                     | Interés legítimo del club, sobre datos que FIDE publica. Puedes oponerte y pedir que se quite |
| Cobrar el plan Pro                                                                              | Ejecución del contrato y obligaciones tributarias                                             |
| Proteger el servicio: limitar intentos, detectar abusos y mantener registros de seguridad       | Interés legítimo en la seguridad del servicio                                                 |

No vendemos tus datos, no los usamos para publicidad y no tomamos decisiones automatizadas que te produzcan efectos jurídicos. El ranking es un cálculo deportivo interno del club.

## 4. Quién ve tus datos

- **Los miembros de tus clubes ven:** tu nombre visible, tu rol, tus partidas en ese club, tu rating y su historial, y tus cuentas vinculadas y Elo FIDE (si existen).
- **Otros clubes no ven nada de un club al que no perteneces.** El aislamiento entre clubes se aplica en la propia base de datos.
- **Tu email** solo lo vemos nosotros. Si pagas el plan Pro, también lo ve Mercado Pago.

## 5. Con quién los compartimos

Usamos proveedores que tratan datos por nuestro encargo y con medidas de seguridad adecuadas:

| Proveedor                                    | Para qué                        | Dónde          |
| -------------------------------------------- | ------------------------------- | -------------- |
| [HOSTING DEL FRONT, p. ej. Vercel]           | Servir el sitio web             | [PAÍS]         |
| [HOSTING DE LA API, p. ej. Fly.io o Railway] | Ejecutar el servicio            | [PAÍS]         |
| [BASE DE DATOS, p. ej. Neon o Supabase]      | Guardar los datos               | [PAÍS]         |
| Resend                                       | Enviar los emails de la cuenta  | Estados Unidos |
| Mercado Pago                                 | Procesar los pagos del plan Pro | [PAÍS]         |

**Lichess, Chess.com y FIDE:** cuando vinculas una cuenta o se asigna un FIDE ID, consultamos sus servicios públicos con ese usuario o FIDE ID. Con Lichess, si lo autorizas, iniciamos sesión solo para confirmar tu usuario y cerramos ese acceso de inmediato.

También podemos entregar datos cuando lo exija la ley o una autoridad competente.

**Transferencias internacionales:** algunos proveedores guardan datos fuera de Chile, por ejemplo en Estados Unidos. En esos casos exigimos garantías adecuadas según la ley, como cláusulas contractuales. [VERIFICAR CON ASESORÍA LEGAL los mecanismos que exige la Ley N° 21.719.]

## 6. Cuánto tiempo los guardamos

- **Cuenta:** mientras la tengas activa. Al eliminarla se borran tu email, tu nombre, tu contraseña, tus membresías, tus ratings y su historial, tus cuentas vinculadas y tu FIDE ID en los clubes. Las partidas que jugaste quedan en el historial de tus rivales, pero a nombre de "Cuenta eliminada", sin nada que te identifique. Si eras el único miembro de un club, el club se borra contigo.
- **Sesiones:** los tokens de sesión vencen a los 30 días.
- **Links enviados por email:** vencen a las 24 horas (confirmar el email) o a 1 hora (cambiar la contraseña), y sirven una sola vez.
- **Registros del servidor:** [PLAZO, p. ej. 30 días].
- **Datos de pago:** el tiempo que exijan las normas tributarias [VERIFICAR PLAZO].

## 7. Niñas, niños y adolescentes

Muchas academias tienen alumnos menores de edad, así que tenemos cuidado especial:

- **Menores de 14 años:** sus datos solo se tratan con el consentimiento de su madre, padre o representante legal. El club que invita a un menor de 14 años declara contar con ese consentimiento y debe poder acreditarlo.
- **Adolescentes de 14 a 17 años:** necesitan la autorización de su madre, padre o representante legal para usar OpenChess. [VERIFICAR CON ASESORÍA LEGAL los requisitos exactos de la Ley N° 21.719 para este tramo de edad.]
- **Lo que no hacemos:** no pedimos la fecha de nacimiento ni más datos de los necesarios. No mostramos datos de menores fuera de su club. No los usamos para publicidad ni para perfiles comerciales.
- **Derechos de la familia:** la madre, el padre o el representante legal pueden ejercer los derechos del punto 9 en nombre del menor.

## 8. Seguridad

Algunas medidas que aplicamos:

- Contraseñas guardadas con argon2id.
- Tokens de sesión y links de email guardados solo como hash.
- Conexiones cifradas (https) y cookies de sesión `httpOnly` y `Secure`.
- Aislamiento entre clubes en la base de datos (Row Level Security).
- Límites de intentos de inicio de sesión.

Si ocurre una vulneración de seguridad que afecte tus datos, te avisaremos y avisaremos a la autoridad en los casos y plazos que exija la ley.

## 9. Tus derechos

Puedes pedirnos:

- **Acceso:** saber qué datos tuyos tratamos.
- **Rectificación:** corregirlos.
- **Supresión:** eliminarlos.
- **Oposición:** que dejemos de tratarlos para ciertos fines.
- **Portabilidad:** recibir tus datos en un formato que puedas llevar a otro servicio.
- **Bloqueo:** que se suspenda temporalmente su tratamiento.

Desde la configuración de tu cuenta puedes cambiar tu nombre visible y tu contraseña, descargar tus datos (en un archivo JSON) y eliminar tu cuenta. Para lo demás, escríbenos a [EMAIL DE PRIVACIDAD] desde el email de tu cuenta. Responderemos dentro del plazo legal [VERIFICAR PLAZO EN LA LEY N° 21.719]. Si no quedas conforme, puedes reclamar ante la Agencia de Protección de Datos Personales.

Para datos que ingresó un club (por ejemplo, tu rol o tu FIDE ID), también puedes pedírselo directamente al club.

## 10. Cookies

Usamos solo cookies necesarias para que el servicio funcione. No usamos cookies de publicidad ni de analítica.

| Cookie       | Para qué                                                       | Duración   |
| ------------ | -------------------------------------------------------------- | ---------- |
| `oc_at`      | Mantener tu sesión iniciada                                    | 15 minutos |
| `oc_rt`      | Renovar la sesión sin volver a pedir la contraseña             | 30 días    |
| `oc_lichess` | Proteger el inicio de sesión con Lichess al vincular la cuenta | 10 minutos |

## 11. Cambios a esta política

Si la cambiamos, publicaremos la nueva versión con su fecha. Si el cambio es importante, te avisaremos por email o en el servicio antes de que rija.

## 12. Contacto

[EMAIL DE PRIVACIDAD]
