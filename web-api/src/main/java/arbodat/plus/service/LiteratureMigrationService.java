package arbodat.plus.service;

import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkLiteratureItem;
import arbodat.plus.model.Literature;
import arbodat.plus.model.Site;
import arbodat.plus.repository.LiteratureRepository;
import arbodat.plus.repository.SiteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

// Links literature to the sites of the migration (literature accordion) in bulk:
// sites and literature are loaded once per request instead of once per row.
@Service
public class LiteratureMigrationService {

    @Autowired
    SiteRepository siteRepository;

    @Autowired
    LiteratureRepository literatureRepository;

    /**
     * Adds the given literature to the sites (the literature linked so far stays). Each item gets its own status:
     * "updated", or "error" (unknown site / literature, no literature).
     */
    @Transactional
    public List<BulkItemStatus> linkAll(List<BulkLiteratureItem> items) {

        Set<UUID> siteIds = items.stream()
                .map(BulkLiteratureItem::getSiteId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, Site> sites = siteRepository.findAllById(siteIds).stream()
                .collect(Collectors.toMap(Site::getId, Function.identity()));
        Set<UUID> literatureIds = items.stream()
                .map(BulkLiteratureItem::getLiteratureIds)
                .filter(Objects::nonNull)
                .flatMap(List::stream)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, Literature> literature = literatureRepository.findAllById(literatureIds).stream()
                .collect(Collectors.toMap(Literature::getId, Function.identity()));

        List<BulkItemStatus> statuses = new ArrayList<>();
        for (BulkLiteratureItem item : items) {
            String clientId = item.getClientId();

            List<UUID> ids = item.getLiteratureIds() != null ? item.getLiteratureIds() : List.of();
            if (ids.isEmpty()) {
                statuses.add(BulkItemStatus.error(clientId, "no literature"));
                continue;
            }
            Optional<UUID> unknown = ids.stream().filter(id -> !literature.containsKey(id)).findFirst();
            if (unknown.isPresent()) {
                statuses.add(BulkItemStatus.error(clientId, "invalid literature id: " + unknown.get()));
                continue;
            }
            Site site = item.getSiteId() != null ? sites.get(item.getSiteId()) : null;
            if (site == null) {
                statuses.add(BulkItemStatus.error(clientId, "invalid site id"));
                continue;
            }

            // The literature owns the link (literature_site_relation)
            ids.forEach(id -> {
                Literature entry = literature.get(id);
                if (entry.getSiteList() == null) entry.setSiteList(new HashSet<>());
                entry.getSiteList().add(site);
            });
            statuses.add(BulkItemStatus.updated(clientId));
        }
        // The literature is saved with the transaction (managed entities)
        return statuses;
    }
}
