# Autómata de estados del bot

Este documento define el diagrama de estados del flujo conversacional.

## Estados

- `router`: evaluacion del contexto actual.
- `category_selection`: seleccion de categoria.
- `car_selection`: seleccion de modelo.
- `lead_capture`: captura de datos de contacto.
- `faq`: respuesta corta de preguntas frecuentes.

## Eventos principales

- `user_selects_category`: usuario elige `SUV`, `Sedan` o `Pickup`.
- `user_selects_car`: usuario elige un modelo de la categoria.
- `user_sends_faq`: usuario hace pregunta general.
- `user_sends_contact_info`: usuario comparte `nombre`, `telefono`, `email`.

## Diagrama

```mermaid
stateDiagram-v2
    [*] --> router

    router --> faq: user_sends_faq
    router --> category_selection: no_category_selected
    router --> car_selection: user_selects_category
    router --> lead_capture: user_selects_car

    category_selection --> [*]: render_category_buttons
    car_selection --> [*]: render_car_buttons
    faq --> [*]: render_faq_response

    lead_capture --> [*]: missing_contact_info
    lead_capture --> [*]: notify_advisor_done
```

## Condiciones de transicion

- `router -> category_selection`:
  - cuando `current_node` inicial no tiene categoria valida.
- `router -> car_selection`:
  - cuando `selected_category` existe o el ultimo mensaje coincide con una categoria.
- `router -> lead_capture`:
  - cuando `selected_car` existe o el ultimo mensaje coincide con un modelo valido.
- `router -> faq`:
  - cuando detecta intencion FAQ (`faq`, `pregunta`, `info`, `informacion`).

## Contrato para frontend

- El frontend debe usar `options` para renderizar botones por estado.
- `current_node` indica la etapa activa del flujo.
- `reply` contiene el texto listo para mostrarse al usuario.
