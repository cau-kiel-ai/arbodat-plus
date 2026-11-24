package arbodat.plus.controller;

import arbodat.plus.model.Laboratory;
import arbodat.plus.repository.LaboratoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/laboratories")
public class LaboratoryController {

    @Autowired
    LaboratoryRepository laboratoryRepository;

    @GetMapping
    public List<Laboratory> getAllLaboratories() {
        return laboratoryRepository.findAll();
    }

    @PostMapping
    public String create(@RequestBody Laboratory laboratory) {
        laboratoryRepository.save(laboratory);
        return "laboratory is created";
    }
}
