package arbodat.plus.repository;

import arbodat.plus.model.ResearchProject;
import arbodat.plus.model.Site;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.*;

@Repository
public interface ResearchProjectRepository extends JpaRepository<ResearchProject, UUID>  {

    @Query("SELECT s FROM Site s JOIN s.researchProjectList p WHERE p.id = :projectId")
    Set<Site> findSitesByResearchProjectId(@Param("projectId") UUID projectId);

    Optional<ResearchProject> findByProjectName(String projectName);

    // Project names compare case-insensitively (like the labels of sites, features, samples)
    List<ResearchProject> findByProjectNameIgnoreCase(String projectName);

    @Query("SELECT DISTINCT rp FROM ResearchProject rp JOIN rp.siteList s WHERE s.id in :siteIds")
    List<ResearchProject> findBySiteIdIn(@Param("siteIds") Collection<UUID> siteIds);
}