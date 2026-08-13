import { DiscoveryProvider } from './DiscoveryProvider';
import { overpassProvider } from './OverpassProvider';
import { wikipediaProvider } from './WikipediaProvider';
import { nominatimProvider } from './NominatimProvider';
import { regionalSearchProvider } from './RegionalSearchProvider';

export const providerRegistry: DiscoveryProvider[] = [
    overpassProvider,
    wikipediaProvider,
    nominatimProvider,
    regionalSearchProvider
];
