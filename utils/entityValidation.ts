import { ResolvedEntity } from '../domain';

export function validateResolvedEntity(entity: any): entity is ResolvedEntity {
    if (!entity) return false;

    const errors: string[] = [];

    if (entity.pipelineVersion !== 2) {
        errors.push("pipelineVersion !== 2");
    }
    if (!entity.id) {
        errors.push("id is missing");
    }
    
    const subject = entity.subject;
    if (!subject) {
        errors.push("subject is missing");
    } else {
        if (!subject.identity) {
            errors.push("subject.identity is missing");
        } else {
            if (!subject.identity.canonicalName) errors.push("identity.canonicalName is missing");
            if (!subject.identity.entityType) errors.push("identity.entityType is missing");
        }

        if (!subject.primaryLocation) {
            errors.push("subject.primaryLocation is missing");
        } else if (!subject.primaryLocation.location?.coordinates) {
            errors.push("primaryLocation.location.coordinates is missing");
        }
    }

    if (!entity.metadata) {
        errors.push("metadata is missing");
    }

    if (errors.length > 0) {
        console.error("[INVALID_ENTITY_FOR_INFOPANEL] Entity validation failed:", errors.join(", "), "Entity:", entity);
        return false;
    }

    return true;
}
