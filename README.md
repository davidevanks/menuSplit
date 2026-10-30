# MenuSplit

Abre **index.html** con doble clic en Chrome, Edge o Firefox. No requiere instalación, servidor ni conexión a Internet.

1. Agrega a las personas en **Participantes**. La persona **Yo** representa tu parte; puedes cambiar su nombre.
2. En **Factura**, selecciona quién consumió cada unidad. Las cantidades, precios y productos de la foto ya están cargados.
3. Revisa el desglose de cada persona. El IVA y la propina se reparten en proporción al consumo antes de cargos de cada participante. Quien no tenga consumo paga cero. Puedes ajustar los porcentajes en **Precios, IVA y propina**.
4. Al terminar las asignaciones, marca **Pagado** para quienes te pagaron y **Mi parte cubierta** para tu parte. Los resúmenes muestran lo recibido, lo pendiente y quién falta.

Mientras exista algún pago marcado, se bloquean los cambios de la cuenta. Desmarca primero los pagos si necesitas corregirla. Cada check representa el importe completo de esa persona; no se registran abonos parciales.

Al final de **Participantes y consumos**, el **Gran total de participantes** suma consumo, IVA y propina de todas las personas, incluidas las que ya pagaron. Se compara con el total de la factura y muestra la diferencia por asignar, incluidos los cargos. Mientras falten unidades por asignar, los importes son provisionales; al completar las asignaciones, el gran total debe coincidir con la factura.

**Compartir** se habilita al asignar todas las unidades. Abre un diálogo para seleccionar uno o varios participantes y pulsa **Enviar** para abrir WhatsApp con un único mensaje: incluye los productos, cantidades, precios, consumo, IVA, propina y total a pagar en negrita de cada seleccionado, además de los datos de transferencia BAC de Kenneth David Gaitan Evanks en córdobas. En WhatsApp debes elegir el chat o grupo y confirmar el envío. Compartir no registra pagos ni modifica la cuenta. Si se bloquea la apertura, usa el enlace que aparece en el diálogo. Puedes salir con **Cancelar** o Escape.

El uso local de MenuSplit sigue funcionando sin conexión; abrir y enviar el mensaje por WhatsApp requiere conexión y acceso a WhatsApp.

Los datos se guardan automáticamente en `localStorage` del navegador. Usa siempre el mismo archivo, navegador y perfil para retomar la cuenta. Si borras los datos del navegador, utilizas otro dispositivo o cambias la ubicación del archivo, la cuenta puede no estar disponible. Si falla el guardado, se muestra un aviso y puedes continuar en la sesión actual.

**Restablecer factura original** borra los cambios y recupera la factura de la foto, previa confirmación. La imagen original se conserva como referencia y puede abrirse dentro de la app.

**Exportar JSON** descarga un respaldo completo de la cuenta visible: participantes, productos, asignaciones, IVA, propina y pagos, incluidos los cambios que no se pudieron guardar en el navegador. Conserva el archivo para trasladar la cuenta a otro navegador o dispositivo.

**Importar JSON** permite seleccionar ese respaldo. La app valida el contenido y pide confirmación antes de reemplazar toda la cuenta actual, incluso si tiene pagos registrados; no combina cuentas. Al restaurar, guarda los datos y conserva los pagos del archivo. Si el archivo es inválido o el guardado falla, la cuenta actual se mantiene. Si hay datos guardados dañados, primero debes restablecer explícitamente la factura; si hay un conflicto con otra pestaña, recarga o restablece antes de importar. El JSON utiliza el objeto de cuenta de versión 2, almacenado en la clave existente `menusplit.account.v1`. Las cuentas guardadas y los respaldos de versión 1 se validan y convierten: conservan consumos, asignaciones y porcentajes, pero sus pagos se desmarcan para revisar los nuevos importes. Los pagos de versión 2 se conservan.

La factura original suma C$8,184.47 de consumo, C$818.45 de propina y C$1,227.67 de IVA: **C$10,230.59**. Los cálculos se realizan en centavos; las cuotas proporcionales se redondean hacia abajo y los centavos restantes se asignan a los mayores residuos, desempatando por orden de participantes. Mientras falten asignaciones, se reserva la cuota de los consumos sin asignar y los importes individuales son provisionales.

## Verificación para desarrollo

La app no necesita Node.js. Si ya está instalado, sus pruebas sin dependencias se ejecutan con:

```sh
node --test app.test.cjs
```

Cubren los importes originales, reparto y redondeo, asignaciones, pagos, bloqueo de cambios, restauración, validación y errores de almacenamiento. Las pruebas de interacción usan un DOM simulado y no sustituyen una revisión visual en un navegador.
