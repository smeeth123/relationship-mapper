# Relationship Mapper

<img width="1258" height="713" alt="Screenshot 2026-06-11 at 1 34 15 PM" src="https://github.com/user-attachments/assets/3a9f270f-2980-4e64-adfe-011210cc5f77" />

Canvas-native relationship mapping tools for Foundry VTT.

Relationship Mapper allows you to create and manage relationship boards directly on the Foundry canvas. Create cards from Actors, Items, or Tokens and connect them with editable, directional relationships.


---

## Features

- Create relationship cards directly on the canvas
- Create nodes from Actors
- Create nodes from Items
- Create nodes from Tokens
- Create completely custom/manual cards
- Connect cards with labeled relationships
- Directional connections (A → B, B → A, or both)
- Edit connections from either endpoint
- Custom card colors, fonts, and sizing
- Custom connection colors and styles
- Grid snapping support
- Scene-specific relationship boards
- Detects Stonetop system and applies visual styling
- Foundry VTT v13 and v14 compatible

---

## Creating Nodes


### Actor and Item Nodes

Right-click an Actor or Item in their directories and choose **Create Relationship Map Node.**


### Token Nodes

Open a Token's HUD and click the Relationship Mapper button.


---

## Creating Connections

1. Click the **Connect** button on a card.
2. Click a second card to create a relationship.
3. Edit the connection label, color, style, and direction.
4. Connections can be edited from either endpoint.

Supported directions:

- Source → Target
- Target → Source
- Both directions
- No arrows

---

## Card Customization

Cards support:

- Custom titles
- Notes and descriptions
- Custom colors
- Custom fonts
- Adjustable sizing
- Image portraits
- Links back to source documents

---

## Module Settings

Relationship Mapper includes configurable defaults for:

- Card colors
- Card fonts
- Card sizing
- Connection colors
- Connection widths
- Connection styles
- Default arrow direction
- Label appearance
- Grid snapping

These defaults can be configured through:

**Settings → Module Settings → Relationship Map Defaults**

---

## Compatibility

Tested with:

- Foundry Virtual Tabletop v13
- Foundry Virtual Tabletop v14

System agnostic.

Includes enhanced visual support for **Stonetop**.

---

## Installation

Install via manifest URL:

```text
https://github.com/smeeth123/relationship-mapper/releases/latest/download/module.json
```
