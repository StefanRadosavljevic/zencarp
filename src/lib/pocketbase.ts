import PocketBase from 'pocketbase';

export const pb = new PocketBase(import.meta.env.PUBLIC_POCKETBASE_URL);

export const fishTypeLabels: Record<string, string> = {
    common_carp: 'Šaran Divljak',
    mirror_carp: 'Šaran Golać',
    grass_carp: 'Amur',
};

export type FishType = keyof typeof fishTypeLabels;