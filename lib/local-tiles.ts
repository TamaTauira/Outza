/**
 * Category tiles on VibePeep Local. Photos are resized excerpts of Wikimedia Commons
 * files. Credits are also listed in public/local-tiles/CREDITS.md and on the page.
 */
export interface LocalTileCredit {
  author: string
  licence: string
  licenceUrl: string
  source: string
  sourceTitle: string
}

export interface LocalTile {
  key: string
  label: string
  src: string
  credit: LocalTileCredit
}

export const LOCAL_TILES: LocalTile[] = [
  {
    key: 'garage-sales',
    label: 'Garage sale',
    src: '/local-tiles/garage-sale.webp',
    credit: {
      author: 'ResaJoan',
      licence: 'CC0 1.0',
      licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Yard_sale,_rummage_sale,_garage_sale,_tag_sale,_charity_sale_-_horizontal.JPG',
      sourceTitle: 'Yard sale, rummage sale, garage sale, tag sale, charity sale',
    },
  },
  {
    key: 'warehouse-sales',
    label: 'Clearance',
    src: '/local-tiles/clearance.webp',
    credit: {
      author: 'Mori Masahiro Design Studio, LLC.',
      licence: 'CC BY 3.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
      source: 'https://commons.wikimedia.org/wiki/File:1976_Multi-Sara_Masahiro-Mori.jpg',
      sourceTitle: 'Multi-purpose Ware series / Dish (1976), Masahiro Mori',
    },
  },
  {
    key: 'school-fundraisers',
    label: 'School fundraiser',
    src: '/local-tiles/school-fundraiser.webp',
    credit: {
      author: 'miheco',
      licence: 'CC BY-SA 2.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Chocolate_mousse_cupcake.jpg',
      sourceTitle: 'Chocolate mousse cupcake',
    },
  },
  {
    key: 'farmers-markets',
    label: 'Farmers market',
    src: '/local-tiles/farmers-market.webp',
    credit: {
      author: 'OnlyJanz',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Fresh_Vegetables_display_in_Iloilo_Terminal_Public_Market_01.jpg',
      sourceTitle: 'Fresh vegetables at Iloilo Terminal Public Market',
    },
  },
  {
    key: 'neighbourhood-popups',
    label: 'Pop-up',
    src: '/local-tiles/popup.webp',
    credit: {
      author: 'Acabashi',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Market_stall_Sclater_Street_Brick_Lane_Market_Shoreditch_London_England_02.jpg',
      sourceTitle: 'Market stall, Sclater Street, Brick Lane Market',
    },
  },
  {
    key: 'community-sport',
    label: 'Community sport',
    src: '/local-tiles/community-sport.webp',
    credit: {
      author: 'Ohene okai',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Soccer_kickoff.jpg',
      sourceTitle: 'Soccer kickoff',
    },
  },
  {
    key: 'dog-friendly',
    label: 'Dog-friendly',
    src: '/local-tiles/dog-friendly.webp',
    credit: {
      author: 'Doriguzzi',
      licence: 'CC BY 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Golden_Retriever_smiling.jpg',
      sourceTitle: 'Golden Retriever smiling',
    },
  },
  {
    key: 'local-art',
    label: 'Local art',
    src: '/local-tiles/local-art.webp',
    credit: {
      author: 'Scott Webb',
      licence: 'CC0 1.0',
      licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Colorful_wall_graffiti_(Unsplash).jpg',
      sourceTitle: 'Colorful wall graffiti',
    },
  },
]

export const localTileFor = (section: string | null | undefined) => LOCAL_TILES.find((tile) => tile.key === section) ?? null
