# Textos legales

- [Términos de uso](./terminos-de-uso.md)
- [Política de privacidad](./politica-de-privacidad.md)

**Son borradores.** Antes de publicarlos tiene que revisarlos alguien con formación legal en Chile, sobre todo:

- **Menores de edad.** Los requisitos de consentimiento de la Ley N° 21.719 para niñas, niños y adolescentes, que rige desde diciembre de 2026.
- **Derecho de retracto.** El del artículo 3 bis de la Ley N° 19.496 en las suscripciones contratadas a distancia.
- **Transferencias internacionales.** Los mecanismos exigidos para los proveedores que guardan datos fuera de Chile.
- **Plazos.** Los de respuesta a solicitudes de derechos y los de conservación de datos tributarios.

## Datos por completar

Lo que está entre corchetes: razón social, RUT, dirección, emails de contacto y de privacidad, dominio, precio del plan Pro, ciudad de los tribunales, proveedores de hosting y sus países, y fechas.

## Pendiente en el producto

- **Eliminar la cuenta** (`DELETE /api/auth/account`, pide la contraseña) y **descargar los datos propios** (`GET /api/auth/account/export`) ya están en el backend; faltan sus botones en el front. La cuenta no se borra: se deja anónima, para que las partidas y el historial de los rivales sigan cuadrando.
- **Plazo de los registros del servidor.** Hay que definirlo y configurarlo en el hosting.
