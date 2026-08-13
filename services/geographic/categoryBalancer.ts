import { Candidate } from '../../types';

export const applyCategoryBalance = (candidates: Candidate[]): Candidate[] => {
    const categories = {
        administrative: [] as Candidate[],
        natural: [] as Candidate[],
        historic: [] as Candidate[],
        tourism: [] as Candidate[],
        transportation: [] as Candidate[],
        other: [] as Candidate[]
    };

    const mapCategory = (type: string) => {
        const t = type.toLowerCase();
        if (t.includes('city') || t.includes('town') || t.includes('municipality') || t.includes('administrative')) return 'administrative';
        if (t.includes('national_park') || t.includes('natural') || t.includes('mountain') || t.includes('park') || t.includes('protected_area') || t.includes('nature reserves')) return 'natural';
        if (t.includes('historic') || t.includes('archaeological') || t.includes('unesco') || t.includes('museum')) return 'historic';
        if (t.includes('tourism') || t.includes('attraction') || t.includes('landmark')) return 'tourism';
        if (t.includes('transportation') || t.includes('airport') || t.includes('station')) return 'transportation';
        return 'other';
    };

    for (const c of candidates) {
        const cat = mapCategory(c.type || 'poi');
        if (categories[cat as keyof typeof categories]) {
            categories[cat as keyof typeof categories].push(c);
        } else {
            categories.other.push(c);
        }
    }

    const quotas = {
        administrative: 3,
        natural: 3,
        historic: 3,
        tourism: 3,
        transportation: 2,
        other: 0
    };

    const balanced: Candidate[] = [];
    
    // First, fulfill minimum quotas from each category
    for (const [cat, items] of Object.entries(categories)) {
        const quota = quotas[cat as keyof typeof quotas] || 0;
        const toAdd = items.slice(0, quota);
        balanced.push(...toAdd);
        categories[cat as keyof typeof categories] = items.slice(quota); // keep the rest
    }

    // Then, add everything else back (since it's just balancing, we shouldn't necessarily drop things here, just ensure we have diversity, wait, if we keep everything else, the flood remains).
    // The instruction says "Category balance should prevent a protected-area flood without corrupting provider behavior." 
    // If we return all of them, the flood isn't prevented. We should probably cap them. But the user said: "RegionalSearchProvider Return all candidates... Category balance should prevent a protected-area flood".
    // I will just add back remaining, or cap remaining? The prompt says "Add category balancing before scoring: administrative: minimum 3... Do NOT let one provider/category dominate discovery."
    // I'll cap each category to a reasonable max (e.g. max 10) to prevent a flood from Nominatim.
    for (const [cat, items] of Object.entries(categories)) {
        balanced.push(...items.slice(0, 10)); // Arbitrary max to prevent flood
    }

    return balanced;
};
