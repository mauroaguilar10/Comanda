# Etapa 2: pedidos

**Objetivo de la etapa:** un cliente entra a la tienda del local, arma su pedido y lo manda; el local lo ve en su panel, lo prepara y lo entrega, y el cliente sigue el estado desde el celular.

## Partes

| PR | Qué entra |
| --- | --- |
| 1. API de pedidos | Tienda pública (menú por slug, crear pedido, seguimiento) y rutas del panel (listar pedidos, cambiar estado, abrir/cerrar la tienda) |
| 2. Web | Tienda con carrito y checkout, página de seguimiento, panel de pedidos del local |
| 3. Tiempo real | Socket.IO: los pedidos nuevos y los cambios de estado llegan sin recargar |

## Decisiones

**El cliente no necesita cuenta.** Pide con nombre y teléfono. Al crear el pedido recibe un link de seguimiento con un token aleatorio (en la base, solo su hash, como las sesiones y las invitaciones). Pedir una cuenta para comprar una pizza espanta clientes.

**Los precios los calcula el servidor.** La tienda manda solo `productId` y cantidad; la API busca el precio actual en el catálogo y calcula el total. Si confiáramos en el precio que manda el navegador, cualquiera podría pedir una pizza a $1.

**Los ítems guardan una copia** del nombre y el precio al momento del pedido (`order_items.name`, `unit_price_cents`). Si mañana el local sube el precio o borra el producto, el pedido de ayer sigue mostrando lo que se cobró.

**Número de pedido por local** (#1, #2, …), que es lo que se dice en el mostrador. Se saca de una tabla `order_sequences` con un `INSERT … ON CONFLICT DO UPDATE … RETURNING`: es atómico, dos pedidos simultáneos nunca reciben el mismo número.

**Estados y quién los mueve:**

```
recibido → en preparación → listo → en camino → entregado      (envío)
recibido → en preparación → listo → entregado (retirado)        (retiro en el local)
cualquiera sin entregar → cancelado
```

| Rol | Puede |
| --- | --- |
| Dueño y encargado | Todo, incluido cancelar |
| Cocina | Recibido → en preparación → listo, y entregar los de retiro |
| Reparto | Listo → en camino → entregado (envíos) |

Las transiciones válidas viven en `@comanda/shared`: la API las hace cumplir y la web las usa para mostrar solo los botones que corresponden.

**La tienda se puede cerrar.** `store_settings.accepting_orders`: con la tienda cerrada se ve el menú pero no se puede pedir.

**Módulos.** `orders` es un módulo nuevo con sus tablas (`orders`, `order_items`, `order_sequences`, `store_settings`). Para el precio de los productos usa el servicio del catálogo y para buscar el local por slug, el de negocios: no lee tablas ajenas.

**Límite de pedidos** por IP en la tienda pública, para frenar a quien quiera llenar el panel de pedidos falsos.

## Fuera de esta etapa

Costo de envío y zonas, horarios de atención, pagos online (Mercado Pago), notificaciones por WhatsApp y el historial de pedidos con filtros. El cobro se registra (efectivo o transferencia) pero no se procesa.
